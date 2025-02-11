import {
  AccessPolicyInteraction,
  BackgroundJobInteraction,
  DEFAULT_MAX_SEARCH_COUNT,
  OperationOutcomeError,
  Operator,
  PropertyType,
  SearchParameterDetails,
  SearchParameterType,
  SearchRequest,
  TypedValue,
  allOk,
  arrayify,
  badRequest,
  canReadResourceType,
  canWriteResourceType,
  createReference,
  deepClone,
  deepEquals,
  evalFhirPath,
  evalFhirPathTyped,
  forbidden,
  formatSearchQuery,
  getReferenceString,
  getSearchParameters,
  getStatus,
  gone,
  isGone,
  isNotFound,
  isObject,
  isOk,
  isReference,
  isResource,
  normalizeErrorString,
  normalizeOperationOutcome,
  notFound,
  parseReference,
  parseSearchRequest,
  preconditionFailed,
  protectedResourceTypes,
  resolveId,
  satisfiedAccessPolicy,
  serverError,
  sleep,
  stringify,
  toPeriod,
  validateResource,
  validateResourceType,
} from '@medplum/core';
import { CreateResourceOptions, FhirRepository, RepositoryMode, UpdateResourceOptions } from '@medplum/fhir-router';
import {
  AccessPolicy,
  Binary,
  Bundle,
  BundleEntry,
  Meta,
  OperationOutcome,
  Project,
  Reference,
  Resource,
  ResourceType,
  SearchParameter,
  StructureDefinition,
} from '@medplum/fhirtypes';
import { Readable } from 'node:stream';
import { Pool, PoolClient } from 'pg';
import { Operation } from 'rfc6902';
import { v7 } from 'uuid';
import validator from 'validator';
import { getConfig } from '../config';
import { DatabaseMode, getDatabasePool } from '../database';
import { getLogger } from '../logger';
import { incrementCounter, recordHistogramValue } from '../otel/otel';
import { getRedis } from '../redis';
import { r4ProjectId } from '../seed';
import {
  AuditEventOutcome,
  AuditEventSubtype,
  CreateInteraction,
  DeleteInteraction,
  HistoryInteraction,
  PatchInteraction,
  ReadInteraction,
  RestfulOperationType,
  SearchInteraction,
  UpdateInteraction,
  VreadInteraction,
  createAuditEvent,
  logAuditEvent,
} from '../util/auditevent';
import { patchObject } from '../util/patch';
import { addBackgroundJobs } from '../workers';
import { addSubscriptionJobs } from '../workers/subscription';
import { validateResourceWithJsonSchema } from './jsonschema';
import { getPatients } from './patient';
import { replaceConditionalReferences, validateResourceReferences } from './references';
import { getFullUrl } from './response';
import { RewriteMode, rewriteAttachments } from './rewrite';
import { buildSearchExpression, searchByReferenceImpl, searchImpl } from './search';
import { getSearchParameterImplementation, lookupTables } from './searchparameter';
import {
  Condition,
  DeleteQuery,
  Disjunction,
  Expression,
  InsertQuery,
  SelectQuery,
  TransactionIsolationLevel,
  normalizeDatabaseError,
  periodToRangeString,
} from './sql';
import { getBinaryStorage } from './storage';

const transactionAttempts = 2;
const retryableTransactionErrorCodes = ['40001'];

/**
 * The RepositoryContext interface defines standard metadata for repository actions.
 * In practice, there will be one Repository per HTTP request.
 * And the RepositoryContext represents the context of that request,
 * such as "who is the current user?" and "what is the current project?"
 */
export interface RepositoryContext {
  /**
   * The current author reference.
   * This should be a FHIR reference string (i.e., "resourceType/id").
   * Where resource type is ClientApplication, Patient, Practitioner, etc.
   * This value will be included in every resource as meta.author.
   */
  author: Reference;

  /**
   * Optional individual, device, or organization for whom the change was made.
   * This value will be included in every resource as meta.onBehalfOf.
   */
  onBehalfOf?: Reference;

  remoteAddress?: string;

  /**
   * Projects that the Repository is allowed to access.
   * This should include the ID/UUID of the current project, but may also include other accessory Projects.
   * If this is undefined, the current user is a server user (e.g. Super Admin)
   * The usual case has two elements: the user's Project and the base R4 Project
   * The user's "primary" Project will be the first element in the array (i.e. projects[0])
   * This value will be included in every resource as meta.project.
   */
  projects?: string[];

  /** Current Project of the authenticated user, or none for the system repository. */
  currentProject?: Project;

  /**
   * Optional compartment restriction.
   * If the compartments array is provided,
   * all queries will be restricted to those compartments.
   */
  accessPolicy?: AccessPolicy;

  /**
   * Optional flag for system administrators,
   * which grants system-level access.
   */
  superAdmin?: boolean;

  /**
   * Optional flag for project administrators,
   * which grants additional project-level access.
   */
  projectAdmin?: boolean;

  /**
   * Optional flag to validate resources in strict mode.
   * Strict mode validates resources against StructureDefinition resources,
   * which includes strict date validation, backbone elements, and more.
   * Non-strict mode uses the official FHIR JSONSchema definition, which is
   * significantly more relaxed.
   */
  strictMode?: boolean;

  /**
   * Optional flag to validate references on write operations.
   * If enabled, the repository will check that all references are valid,
   * and that the current user has access to the referenced resource.
   */
  checkReferencesOnWrite?: boolean;

  /**
   * Optional flag to include Medplum extended meta fields.
   * Medplum tracks additional metadata for each resource, such as:
   * 1) "author" - Reference to the last user who modified the resource.
   * 2) "project" - Reference to the project that owns the resource.
   * 3) "compartment" - References to all compartments the resource is in.
   */
  extendedMode?: boolean;
}

export interface CacheEntry<T extends Resource = Resource> {
  resource: T;
  projectId: string;
}

export interface InteractionOptions {
  verbose?: boolean;
}

export interface ReadResourceOptions extends InteractionOptions {
  checkCacheOnly?: boolean;
}

export interface ResendSubscriptionsOptions extends InteractionOptions {
  interaction?: BackgroundJobInteraction;
  subscription?: string;
}

export interface ProcessAllResourcesOptions {
  delayBetweenPagesMs?: number;
}

/**
 * The Repository class manages reading and writing to the FHIR repository.
 * It is a thin layer on top of the database.
 * Repository instances should be created per author and project.
 */
export class Repository extends FhirRepository<PoolClient> implements Disposable {
  private readonly context: RepositoryContext;
  private conn?: PoolClient;
  private readonly disposable: boolean = true;
  private transactionDepth = 0;
  private closed = false;
  mode: RepositoryMode;

  private preCommitCallbacks: (() => Promise<void>)[] = [];
  private postCommitCallbacks: (() => Promise<void>)[] = [];

  constructor(context: RepositoryContext, conn?: PoolClient) {
    super();
    this.context = context;
    this.context.projects?.push?.(r4ProjectId);
    if (!this.context.author?.reference) {
      throw new Error('Invalid author reference');
    }

    if (conn) {
      this.conn = conn;
      this.disposable = false;
    }

    // Default to writer mode
    // In the future, as we do more testing and validation, we will explore defaulting to reader mode
    // However, for now, we default to writer and only use reader mode for requests guaranteed not to have consistency risks
    this.mode = RepositoryMode.WRITER;
  }

  clone(): Repository {
    return new Repository(this.context, this.conn);
  }

  setMode(mode: RepositoryMode): void {
    this.mode = mode;
  }

  currentProject(): Project | undefined {
    return this.context.currentProject;
  }

  async createResource<T extends Resource>(resource: T, options?: CreateResourceOptions): Promise<T> {
    const resourceWithId = {
      ...resource,
      id: options?.assignedId && resource.id ? resource.id : this.generateId(),
    };
    const startTime = Date.now();
    try {
      const result = await this.updateResourceImpl(resourceWithId, true);
      const durationMs = Date.now() - startTime;

      await this.postCommit(async () => {
        this.logEvent(CreateInteraction, AuditEventOutcome.Success, undefined, { resource: result, durationMs });
      });
      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      this.logEvent(CreateInteraction, AuditEventOutcome.MinorFailure, err, { durationMs });
      throw err;
    }
  }

  generateId(): string {
    return v7();
  }

  async readResource<T extends Resource>(
    resourceType: T['resourceType'],
    id: string,
    options?: ReadResourceOptions
  ): Promise<T> {
    const startTime = Date.now();
    try {
      const result = this.removeHiddenFields(await this.readResourceImpl<T>(resourceType, id, options));
      const durationMs = Date.now() - startTime;
      this.logEvent(ReadInteraction, AuditEventOutcome.Success, undefined, { resource: result, durationMs });
      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      this.logEvent(ReadInteraction, AuditEventOutcome.MinorFailure, err, {
        resource: { reference: `${resourceType}/${id}` },
        durationMs,
      });
      throw err;
    }
  }

  private async readResourceImpl<T extends Resource>(
    resourceType: T['resourceType'],
    id: string,
    options?: ReadResourceOptions
  ): Promise<T> {
    if (!id || !validator.isUUID(id)) {
      throw new OperationOutcomeError(notFound);
    }

    validateResourceType(resourceType);

    if (!this.canReadResourceType(resourceType)) {
      throw new OperationOutcomeError(forbidden);
    }

    const cacheRecord = await this.getCacheEntry<T>(resourceType, id);
    if (cacheRecord) {
      // This is an optimization to avoid a database query.
      // However, it depends on all values in the cache having "meta.compartment"
      // Old versions of Medplum did not populate "meta.compartment"
      // So this optimization is blocked until we add a migration.
      // if (!this.canReadCacheEntry(cacheRecord)) {
      //   throw new OperationOutcomeError(notFound);
      // }
      if (this.canReadCacheEntry(cacheRecord)) {
        return cacheRecord.resource;
      }
    }

    if (options?.checkCacheOnly) {
      throw new OperationOutcomeError(notFound);
    }

    return this.readResourceFromDatabase(resourceType, id);
  }

  private async readResourceFromDatabase<T extends Resource>(resourceType: string, id: string): Promise<T> {
    if (!validator.isUUID(id)) {
      throw new OperationOutcomeError(notFound);
    }

    const builder = new SelectQuery(resourceType).column('content').column('deleted').where('id', '=', id);

    this.addSecurityFilters(builder, resourceType);

    const rows = await builder.execute(this.getDatabaseClient(DatabaseMode.READER));
    if (rows.length === 0) {
      throw new OperationOutcomeError(notFound);
    }

    if (rows[0].deleted) {
      throw new OperationOutcomeError(gone);
    }

    const resource = JSON.parse(rows[0].content as string) as T;
    await this.setCacheEntry(resource);
    return resource;
  }

  private canReadCacheEntry(cacheEntry: CacheEntry): boolean {
    if (this.isSuperAdmin()) {
      return true;
    }
    if (!this.context.projects?.includes(cacheEntry.projectId)) {
      return false;
    }
    if (!satisfiedAccessPolicy(cacheEntry.resource, AccessPolicyInteraction.READ, this.context.accessPolicy)) {
      return false;
    }
    return true;
  }

  async readReferences(references: Reference[]): Promise<(Resource | Error)[]> {
    const cacheEntries = await this.getCacheEntries(references);
    const result: (Resource | Error)[] = new Array(references.length);

    for (let i = 0; i < result.length; i++) {
      const startTime = Date.now();
      const reference = references[i];
      const cacheEntry = cacheEntries[i];
      let entryResult = await this.processReadReferenceEntry(reference, cacheEntry);
      const durationMs = Date.now() - startTime;

      if (entryResult instanceof Error) {
        const reference = references[i];
        this.logEvent(ReadInteraction, AuditEventOutcome.MinorFailure, entryResult, {
          resource: reference,
          durationMs,
        });
      } else {
        entryResult = this.removeHiddenFields(entryResult);
        this.logEvent(ReadInteraction, AuditEventOutcome.Success, undefined, { resource: entryResult, durationMs });
      }
      result[i] = entryResult;
    }

    return result;
  }

  private async processReadReferenceEntry(
    reference: Reference,
    cacheEntry: CacheEntry | undefined
  ): Promise<Resource | Error> {
    try {
      const [resourceType, id] = parseReference(reference);
      validateResourceType(resourceType);

      if (!this.canReadResourceType(resourceType)) {
        return new OperationOutcomeError(forbidden);
      }

      if (cacheEntry) {
        if (!this.canReadCacheEntry(cacheEntry)) {
          return new OperationOutcomeError(notFound);
        }
        return cacheEntry.resource;
      }
      return await this.readResourceFromDatabase(resourceType, id);
    } catch (err) {
      if (err instanceof OperationOutcomeError) {
        return err;
      }
      return new OperationOutcomeError(normalizeOperationOutcome(err), err);
    }
  }

  async readReference<T extends Resource>(reference: Reference<T>): Promise<T> {
    let parts: [T['resourceType'], string];
    try {
      parts = parseReference(reference);
    } catch (_err) {
      throw new OperationOutcomeError(badRequest('Invalid reference'));
    }
    return this.readResource(parts[0], parts[1]);
  }

  /**
   * Returns resource history.
   *
   * Results are sorted with oldest versions last
   *
   * See: https://www.hl7.org/fhir/http.html#history
   * @param resourceType - The FHIR resource type.
   * @param id - The FHIR resource ID.
   * @param limit - The maximum number of results to return.
   * @returns Operation outcome and a history bundle.
   */
  async readHistory<T extends Resource>(resourceType: T['resourceType'], id: string, limit = 100): Promise<Bundle<T>> {
    const startTime = Date.now();
    try {
      let resource: T | undefined = undefined;
      try {
        resource = await this.readResourceImpl<T>(resourceType, id);
      } catch (err) {
        if (!(err instanceof OperationOutcomeError) || !isGone(err.outcome)) {
          throw err;
        }
      }

      const rows = await new SelectQuery(resourceType + '_History')
        .column('versionId')
        .column('id')
        .column('content')
        .column('lastUpdated')
        .where('id', '=', id)
        .orderBy('lastUpdated', true)
        .limit(Math.min(limit, DEFAULT_MAX_SEARCH_COUNT))
        .execute(this.getDatabaseClient(DatabaseMode.READER));

      const entries: BundleEntry<T>[] = [];

      for (const row of rows) {
        const resource = row.content ? this.removeHiddenFields(JSON.parse(row.content as string)) : undefined;
        const outcome: OperationOutcome = row.content
          ? allOk
          : {
              resourceType: 'OperationOutcome',
              id: 'gone',
              issue: [
                {
                  severity: 'error',
                  code: 'deleted',
                  details: {
                    text: 'Deleted on ' + row.lastUpdated,
                  },
                },
              ],
            };
        entries.push({
          fullUrl: getFullUrl(resourceType, row.id),
          request: {
            method: 'GET',
            url: `${resourceType}/${row.id}/_history/${row.versionId}`,
          },
          response: {
            status: getStatus(outcome).toString(),
            outcome,
          },
          resource,
        });
      }

      const durationMs = Date.now() - startTime;
      this.logEvent(HistoryInteraction, AuditEventOutcome.Success, undefined, { resource, durationMs });
      return {
        resourceType: 'Bundle',
        type: 'history',
        entry: entries,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      this.logEvent(HistoryInteraction, AuditEventOutcome.MinorFailure, err, {
        resource: { reference: `${resourceType}/${id}` },
        durationMs,
      });
      throw err;
    }
  }

  async readVersion<T extends Resource>(resourceType: T['resourceType'], id: string, vid: string): Promise<T> {
    const startTime = Date.now();
    const versionReference = { reference: `${resourceType}/${id}/_history/${vid}` };
    try {
      if (!validator.isUUID(id) || !validator.isUUID(vid)) {
        throw new OperationOutcomeError(notFound);
      }

      try {
        await this.readResourceImpl<T>(resourceType, id);
      } catch (err) {
        if (!isGone(normalizeOperationOutcome(err))) {
          throw err;
        }
      }

      const rows = await new SelectQuery(resourceType + '_History')
        .column('content')
        .where('id', '=', id)
        .where('versionId', '=', vid)
        .execute(this.getDatabaseClient(DatabaseMode.READER));

      if (rows.length === 0) {
        throw new OperationOutcomeError(notFound);
      }

      const result = this.removeHiddenFields(JSON.parse(rows[0].content as string));
      const durationMs = Date.now() - startTime;
      this.logEvent(VreadInteraction, AuditEventOutcome.Success, undefined, { resource: versionReference, durationMs });
      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      this.logEvent(VreadInteraction, AuditEventOutcome.MinorFailure, err, { resource: versionReference, durationMs });
      throw err;
    }
  }

  async updateResource<T extends Resource>(resource: T, options?: UpdateResourceOptions): Promise<T> {
    const startTime = Date.now();
    try {
      let result: T;
      if (options?.ifMatch) {
        // Conditional update requires transaction
        result = await this.withTransaction(() => this.updateResourceImpl(resource, false, options.ifMatch));
      } else {
        result = await this.updateResourceImpl(resource, false);
      }
      const durationMs = Date.now() - startTime;
      await this.postCommit(async () => {
        this.logEvent(UpdateInteraction, AuditEventOutcome.Success, undefined, { resource: result, durationMs });
      });
      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      this.logEvent(UpdateInteraction, AuditEventOutcome.MinorFailure, err, { resource, durationMs });
      throw err;
    }
  }

  private async updateResourceImpl<T extends Resource>(resource: T, create: boolean, versionId?: string): Promise<T> {
    const { resourceType, id } = resource;
    if (!id) {
      throw new OperationOutcomeError(badRequest('Missing id'));
    }
    if (!validator.isUUID(id)) {
      throw new OperationOutcomeError(badRequest('Invalid id'));
    }

    // Add default profiles before validating resource
    if (!resource.meta?.profile && this.currentProject()?.defaultProfile) {
      const defaultProfiles = this.currentProject()?.defaultProfile?.find(
        (o) => o.resourceType === resourceType
      )?.profile;
      resource.meta = { ...resource.meta, profile: defaultProfiles };
    }

    if (!this.canWriteResourceType(resourceType)) {
      throw new OperationOutcomeError(forbidden);
    }

    const existing = create ? undefined : await this.checkExistingResource<T>(resourceType, id);
    if (existing) {
      (existing.meta as Meta).compartment = this.getCompartments(existing); // Update compartments with latest rules
      if (!this.canWriteToResource(existing)) {
        // Check before the update
        throw new OperationOutcomeError(forbidden);
      }
      if (versionId && existing.meta?.versionId !== versionId) {
        throw new OperationOutcomeError(preconditionFailed);
      }
    }

    let updated = await rewriteAttachments<T>(RewriteMode.REFERENCE, this, {
      ...this.restoreReadonlyFields(resource, existing),
    });
    updated = await replaceConditionalReferences(this, updated);

    const resultMeta: Meta = {
      ...updated.meta,
      versionId: this.generateId(),
      lastUpdated: this.getLastUpdated(existing, resource),
      author: this.getAuthor(resource),
      onBehalfOf: this.context.onBehalfOf,
    };

    const result: T = { ...updated, meta: resultMeta };

    const project = this.getProjectId(existing, updated);
    if (project) {
      resultMeta.project = project;
    }
    const accounts = await this.getAccounts(existing, updated);
    if (accounts) {
      resultMeta.account = accounts[0];
      resultMeta.accounts = accounts;
    }
    resultMeta.compartment = this.getCompartments(result);

    // Validate resource after all modifications and touchups above are done
    await this.validateResource(result);
    if (this.context.checkReferencesOnWrite) {
      await this.preCommit(async () => {
        await validateResourceReferences(this, result);
      });
    }

    if (this.isNotModified(existing, result)) {
      this.removeHiddenFields(existing);
      return existing;
    }

    if (!this.isResourceWriteable(existing, result)) {
      // Check after the update
      throw new OperationOutcomeError(forbidden);
    }

    await this.handleStorage(result, create);
    await this.postCommit(async () => {
      await this.handleBinaryUpdate(existing, result);
      await addBackgroundJobs(result, existing, { interaction: create ? 'create' : 'update' });
    });

    const output = deepClone(result);
    return this.removeHiddenFields(output);
  }

  /**
   * Handles a Binary resource update.
   * If the resource has embedded base-64 data, writes the data to the binary storage.
   * Otherwise if the resource already exists, copies the existing binary to the new resource.
   * @param existing - Existing binary if it exists.
   * @param resource - The resource to write to the database.
   */
  private async handleBinaryUpdate<T extends Resource>(existing: T | undefined, resource: T): Promise<void> {
    if (resource.resourceType !== 'Binary') {
      return;
    }

    if (resource.data) {
      await this.handleBinaryData(resource);
    } else if (existing) {
      await getBinaryStorage().copyBinary(existing as Binary, resource);
    }
  }

  /**
   * Handles a Binary resource with embedded base-64 data.
   * Writes the data to the binary storage and removes the data field from the resource.
   * @param resource - The resource to write to the database.
   */
  private async handleBinaryData(resource: Binary): Promise<void> {
    // Parse result.data as a base64 string
    const buffer = Buffer.from(resource.data as string, 'base64');

    // Convert buffer to a Readable stream
    const stream = new Readable({
      read() {
        this.push(buffer);
        this.push(null); // Signifies the end of the stream (EOF)
      },
    });

    // Write the stream to the binary storage
    await getBinaryStorage().writeBinary(resource, undefined, resource.contentType, stream);

    // Remove the data field from the resource
    resource.data = undefined;
  }

  /**
   * Handles persisting data to at-rest storage: cache and/or database.
   * This method handles all the special cases for storage, including cache invalidation.
   * @param resource - The resource to store.
   * @param create - Whether the resource is being create, or updated in place.
   */
  private async handleStorage(resource: Resource, create: boolean): Promise<void> {
    if (!this.isCacheOnly(resource)) {
      await this.writeToDatabase(resource, create);
    }
    await this.setCacheEntry(resource);

    // Handle special cases for resource caching
    if (resource.resourceType === 'Subscription' && resource.channel?.type === 'websocket') {
      const redis = getRedis();
      const project = resource?.meta?.project;
      if (!project) {
        throw new OperationOutcomeError(serverError(new Error('No project connected to the specified Subscription.')));
      }
      // WebSocket Subscriptions are also cache-only, but also need to be added to a special cache key
      await redis.sadd(`medplum:subscriptions:r4:project:${project}:active`, `Subscription/${resource.id}`);
    }
    if (resource.resourceType === 'StructureDefinition') {
      await removeCachedProfile(resource);
    }
  }

  /**
   * Validates a resource against the current project configuration.
   * If strict mode is enabled (default), validates against base StructureDefinition and all profiles.
   * If strict mode is disabled, validates against the legacy JSONSchema validator.
   * Throws on validation errors.
   * Returns silently on success.
   * @param resource - The candidate resource to validate.
   */
  async validateResource(resource: Resource): Promise<void> {
    if (this.context.strictMode) {
      await this.validateResourceStrictly(resource);
    } else {
      // Perform loose validation first to detect any severe issues
      validateResourceWithJsonSchema(resource);

      // Attempt strict validation and log warnings on failure
      try {
        await this.validateResourceStrictly(resource);
      } catch (err: any) {
        getLogger().warn('Strict validation would fail', {
          resource: getReferenceString(resource),
          err,
        });
      }
    }
  }

  private async validateResourceStrictly(resource: Resource): Promise<void> {
    const logger = getLogger();
    const start = Date.now();

    const issues = validateResource(resource);
    for (const issue of issues) {
      logger.warn(`Validator warning: ${issue.details?.text}`, { project: this.context.projects?.[0], issue });
    }

    const profileUrls = resource.meta?.profile;
    if (profileUrls) {
      await this.validateProfiles(resource, profileUrls);
    }

    const durationMs = Date.now() - start;
    if (durationMs > 10) {
      logger.debug('High validator latency', {
        resourceType: resource.resourceType,
        id: resource.id,
        durationMs,
      });
    }
  }

  private async validateProfiles(resource: Resource, profileUrls: string[]): Promise<void> {
    const logger = getLogger();
    for (const url of profileUrls) {
      const loadStart = process.hrtime.bigint();
      const profile = await this.loadProfile(url);
      const loadTime = Number(process.hrtime.bigint() - loadStart);
      if (!profile) {
        logger.warn('Unknown profile referenced', {
          resource: `${resource.resourceType}/${resource.id}`,
          url,
        });
        continue;
      }
      const validateStart = process.hrtime.bigint();
      validateResource(resource, { profile });
      const validateTime = Number(process.hrtime.bigint() - validateStart);
      logger.debug('Profile loaded', {
        url,
        loadTime,
        validateTime,
      });
    }
  }

  private async loadProfile(url: string): Promise<StructureDefinition | undefined> {
    const projectIds = this.context.projects;

    if (projectIds?.length) {
      // Try loading from cache, using all available Project IDs
      const cacheKeys = projectIds.map((id) => getProfileCacheKey(id, url));
      const results = await getRedis().mget(...cacheKeys);
      const cachedProfile = results.find(Boolean) as string | undefined;
      if (cachedProfile) {
        return (JSON.parse(cachedProfile) as CacheEntry<StructureDefinition>).resource;
      }
    }

    // Fall back to loading from the DB; descending version sort approximates version resolution for some cases
    const profile = await this.searchOne<StructureDefinition>({
      resourceType: 'StructureDefinition',
      filters: [
        {
          code: 'url',
          operator: Operator.EQUALS,
          value: url,
        },
      ],
      sortRules: [
        {
          code: 'version',
          descending: true,
        },
        {
          code: 'date',
          descending: true,
        },
      ],
    });

    if (projectIds?.length && profile) {
      // Store loaded profile in cache
      await cacheProfile(profile);
    }
    return profile;
  }

  /**
   * Writes the resource to the database.
   * This is a single atomic operation inside of a transaction.
   * @param resource - The resource to write to the database.
   * @param create - If true, then the resource is being created.
   */
  private async writeToDatabase<T extends Resource>(resource: T, create: boolean): Promise<void> {
    await this.ensureInTransaction(async (client) => {
      await this.writeResource(client, resource);
      await this.writeResourceVersion(client, resource);
      await this.writeLookupTables(client, resource, create);
    });
  }

  /**
   * Tries to return the existing resource, if it is available.
   * Handles the following cases:
   *  - Previous version exists
   *  - Previous version was deleted, and user is restoring it
   *  - Previous version does not exist, and user does not have permission to create by ID
   *  - Previous version does not exist, and user does have permission to create by ID
   * @param resourceType - The FHIR resource type.
   * @param id - The resource ID.
   * @returns The existing resource, if found.
   */
  private async checkExistingResource<T extends Resource>(
    resourceType: T['resourceType'],
    id: string
  ): Promise<T | undefined> {
    try {
      return await this.readResourceImpl<T>(resourceType, id);
    } catch (err) {
      const outcome = normalizeOperationOutcome(err);
      if (!isOk(outcome) && !isNotFound(outcome) && !isGone(outcome)) {
        throw new OperationOutcomeError(outcome, err);
      }

      if (isNotFound(outcome) && !this.canSetId()) {
        throw new OperationOutcomeError(outcome, err);
      }

      // Otherwise, it is ok if the resource is not found.
      // This is an "update" operation, and the outcome is "not-found" or "gone",
      // and the current user has permission to create a new version.
      return undefined;
    }
  }

  /**
   * Returns true if the resource is not modified from the existing resource.
   * @param existing - The existing resource.
   * @param updated - The updated resource.
   * @returns True if the resource is not modified.
   */
  private isNotModified<T extends Resource>(existing: T | undefined, updated: T): existing is T {
    if (!existing) {
      return false;
    }

    // When stricter FHIR validation is enabled, then this can be removed.
    // At present, there are some cases where a server accepts "empty" values that escape the deep equals.
    const cleanExisting = JSON.parse(stringify(existing));
    const cleanUpdated = JSON.parse(stringify(updated));
    return deepEquals(cleanExisting, cleanUpdated);
  }

  /**
   * Reindexes the resource.
   * This is only available to the system and super admin accounts.
   * This should not result in any change to the resource or its history.
   * @param resourceType - The resource type.
   * @param id - The resource ID.
   * @returns Promise to complete.
   */
  async reindexResource<T extends Resource = Resource>(resourceType: T['resourceType'], id: string): Promise<void> {
    if (!this.isSuperAdmin()) {
      throw new OperationOutcomeError(forbidden);
    }

    await this.withTransaction(async (conn) => {
      const resource = await this.readResourceImpl<T>(resourceType, id);
      return this.reindexResources(conn, [resource]);
    });
  }

  /**
   * Internal implementation of reindexing a resource.
   * This accepts a resource as a parameter, rather than a resource type and ID.
   * When doing a bulk reindex, this will be more efficient because it avoids unnecessary reads.
   * @param conn - Database client to use for reindex operations.
   * @param resources - The resource(s) to reindex.
   */
  async reindexResources<T extends Resource>(conn: PoolClient, resources: T[]): Promise<void> {
    let resource: Resource;
    // Since the page size could be relatively large (1k+), preferring a simple for loop with re-used variables
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < resources.length; i++) {
      resource = resources[i];
      const meta = resource.meta as Meta;
      meta.compartment = this.getCompartments(resource);

      if (!meta.project) {
        const projectRef = meta.compartment.find((r) => r.reference?.startsWith('Project/'));
        meta.project = resolveId(projectRef);
      }

      await this.writeLookupTables(conn, resource, false);
    }
    await this.batchWriteResources(conn, resources);
  }

  /**
   * Resends subscriptions for the resource.
   * This is only available to the admin accounts.
   * This should not result in any change to the resource or its history.
   * @param resourceType - The resource type.
   * @param id - The resource ID.
   * @param options - Additional options.
   * @returns Promise to complete.
   */
  async resendSubscriptions<T extends Resource = Resource>(
    resourceType: T['resourceType'],
    id: string,
    options?: ResendSubscriptionsOptions
  ): Promise<void> {
    if (!this.isSuperAdmin() && !this.isProjectAdmin()) {
      throw new OperationOutcomeError(forbidden);
    }

    const resource = await this.readResourceImpl<T>(resourceType, id);
    const interaction = options?.interaction ?? 'update';
    let previousVersion: T | undefined;

    if (interaction === 'update') {
      const history = await this.readHistory(resourceType, id, 2);
      if (history.entry?.[0]?.resource?.meta?.versionId !== resource.meta?.versionId) {
        throw new OperationOutcomeError(preconditionFailed);
      }
      previousVersion = history.entry?.[1]?.resource;
    }

    return addSubscriptionJobs(resource, previousVersion, { interaction }, options);
  }

  async deleteResource<T extends Resource = Resource>(resourceType: T['resourceType'], id: string): Promise<void> {
    const startTime = Date.now();
    let resource: Resource;
    try {
      resource = await this.readResourceImpl<T>(resourceType, id);
    } catch (err) {
      const outcomeErr = err as OperationOutcomeError;
      if (isGone(outcomeErr.outcome)) {
        return; // Resource is already deleted, return successfully
      }
      throw err;
    }

    try {
      if (!this.canWriteResourceType(resourceType) || !this.isResourceWriteable(undefined, resource)) {
        throw new OperationOutcomeError(forbidden);
      }

      await this.deleteCacheEntry(resourceType, id);

      await this.ensureInTransaction(async (conn) => {
        const lastUpdated = new Date();
        const content = '';
        const columns: Record<string, any> = {
          id,
          lastUpdated,
          deleted: true,
          projectId: resource.meta?.project,
          compartments: this.getCompartments(resource).map((ref) => resolveId(ref)),
          content,
        };

        const searchParams = getSearchParameters(resourceType);
        if (searchParams) {
          for (const searchParam of Object.values(searchParams)) {
            this.buildColumn({ resourceType } as Resource, columns, searchParam);
          }
        }

        await new InsertQuery(resourceType, [columns]).mergeOnConflict().execute(conn);

        await new InsertQuery(resourceType + '_History', [
          {
            id,
            versionId: this.generateId(),
            lastUpdated,
            content,
          },
        ]).execute(conn);

        await this.deleteFromLookupTables(conn, resource);
        const durationMs = Date.now() - startTime;

        await this.postCommit(async () => {
          this.logEvent(DeleteInteraction, AuditEventOutcome.Success, undefined, { resource, durationMs });
        });
      });

      await addSubscriptionJobs(resource, resource, { interaction: 'delete' });
    } catch (err) {
      const durationMs = Date.now() - startTime;
      this.logEvent(DeleteInteraction, AuditEventOutcome.MinorFailure, err, {
        resource: { reference: `${resourceType}/${id}` },
        durationMs,
      });
      throw err;
    }
  }

  async patchResource<T extends Resource = Resource>(
    resourceType: T['resourceType'],
    id: string,
    patch: Operation[],
    options?: UpdateResourceOptions
  ): Promise<T> {
    const startTime = Date.now();
    try {
      return await this.withTransaction(async () => {
        const resource = await this.readResourceFromDatabase<T>(resourceType, id);

        if (resource.resourceType !== resourceType) {
          throw new OperationOutcomeError(badRequest('Incorrect resource type'));
        }
        if (resource.id !== id) {
          throw new OperationOutcomeError(badRequest('Incorrect ID'));
        }

        patchObject(resource, patch);

        const result = await this.updateResourceImpl(resource, false, options?.ifMatch);
        const durationMs = Date.now() - startTime;

        await this.postCommit(async () => {
          this.logEvent(PatchInteraction, AuditEventOutcome.Success, undefined, { resource: result, durationMs });
        });
        return result;
      });
    } catch (err) {
      const durationMs = Date.now() - startTime;
      this.logEvent(PatchInteraction, AuditEventOutcome.MinorFailure, err, {
        resource: { reference: `${resourceType}/${id}` },
        durationMs,
      });
      throw err;
    }
  }

  /**
   * Permanently deletes the specified resource and all of its history.
   * This is only available to the system and super admin accounts.
   * @param resourceType - The FHIR resource type.
   * @param id - The resource ID.
   */
  async expungeResource(resourceType: string, id: string): Promise<void> {
    await this.expungeResources(resourceType, [id]);
  }

  /**
   * Permanently deletes the specified resources and all of its history.
   * This is only available to the system and super admin accounts.
   * @param resourceType - The FHIR resource type.
   * @param ids - The resource IDs.
   */
  async expungeResources(resourceType: string, ids: string[]): Promise<void> {
    if (!this.isSuperAdmin()) {
      throw new OperationOutcomeError(forbidden);
    }
    await this.withTransaction(async (client) => {
      for (const id of ids) {
        await this.deleteFromLookupTables(client, { resourceType, id } as Resource);
      }

      const db = this.getDatabaseClient(DatabaseMode.WRITER);
      await new DeleteQuery(resourceType).where('id', 'IN', ids).execute(db);
      await new DeleteQuery(resourceType + '_History').where('id', 'IN', ids).execute(db);
      await this.postCommit(() => this.deleteCacheEntries(resourceType, ids));
    });
  }

  /**
   * Purges resources of the specified type that were last updated before the specified date.
   * This is only available to the system and super admin accounts.
   * @param resourceType - The FHIR resource type.
   * @param before - The date before which resources should be purged.
   */
  async purgeResources(resourceType: ResourceType, before: string): Promise<void> {
    if (!this.isSuperAdmin()) {
      throw new OperationOutcomeError(forbidden);
    }

    const client = this.getDatabaseClient(DatabaseMode.WRITER);

    // Delete from lookup tables first
    // These operations use the main resource table for lastUpdated, so must come first
    for (const lookupTable of lookupTables) {
      await lookupTable.purgeValuesBefore(client, resourceType, before);
    }

    await new DeleteQuery(resourceType).where('lastUpdated', '<=', before).execute(client);
    await new DeleteQuery(resourceType + '_History').where('lastUpdated', '<=', before).execute(client);
  }

  async search<T extends Resource>(searchRequest: SearchRequest<T>): Promise<Bundle<T>> {
    const startTime = Date.now();
    try {
      // Resource type validation is performed in the searchImpl function
      const result = await searchImpl(this, searchRequest);
      const durationMs = Date.now() - startTime;
      this.logEvent(SearchInteraction, AuditEventOutcome.Success, undefined, { searchRequest, durationMs });
      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      this.logEvent(SearchInteraction, AuditEventOutcome.MinorFailure, err, { searchRequest, durationMs });
      throw err;
    }
  }

  async processAllResources<T extends Resource>(
    initialSearchRequest: SearchRequest<T>,
    process: (resource: T) => Promise<void>,
    options?: ProcessAllResourcesOptions
  ): Promise<void> {
    let searchRequest: SearchRequest<T> | undefined = initialSearchRequest;
    while (searchRequest) {
      const bundle: Bundle<T> = await this.search<T>(searchRequest);
      if (!bundle.entry?.length) {
        break;
      }
      for (const entry of bundle.entry) {
        if (entry.resource?.id) {
          await process(entry.resource);
        }
      }
      const nextLink = bundle.link?.find((b) => b.relation === 'next');
      if (nextLink) {
        searchRequest = parseSearchRequest<T>(nextLink.url);
        if (options?.delayBetweenPagesMs) {
          await sleep(options.delayBetweenPagesMs);
        }
      } else {
        searchRequest = undefined;
      }
    }
  }

  async searchByReference<T extends Resource>(
    searchRequest: SearchRequest<T>,
    referenceField: string,
    references: string[]
  ): Promise<Record<string, T[]>> {
    const startTime = Date.now();
    try {
      const result = await searchByReferenceImpl<T>(this, searchRequest, referenceField, references);
      const durationMs = Date.now() - startTime;
      this.logEvent(SearchInteraction, AuditEventOutcome.Success, undefined, { searchRequest, durationMs });
      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      this.logEvent(SearchInteraction, AuditEventOutcome.MinorFailure, err, { searchRequest, durationMs });
      throw err;
    }
  }

  /**
   * Adds filters to ignore soft-deleted resources.
   * @param builder - The select query builder.
   */
  addDeletedFilter(builder: SelectQuery): void {
    builder.where('deleted', '=', false);
  }

  /**
   * Adds security filters to the select query.
   * @param builder - The select query builder.
   * @param resourceType - The resource type for compartments.
   */
  addSecurityFilters(builder: SelectQuery, resourceType: string): void {
    if (this.isSuperAdmin()) {
      // No compartment restrictions for admins.
      return;
    }

    this.addProjectFilters(builder);
    this.addAccessPolicyFilters(builder, resourceType);
  }

  /**
   * Adds the "project" filter to the select query.
   * @param builder - The select query builder.
   */
  private addProjectFilters(builder: SelectQuery): void {
    if (this.context.projects?.length) {
      builder.where('compartments', 'ARRAY_CONTAINS', this.context.projects, 'UUID[]');
    }
  }

  /**
   * Adds access policy filters to the select query.
   * @param builder - The select query builder.
   * @param resourceType - The resource type being searched.
   */
  private addAccessPolicyFilters(builder: SelectQuery, resourceType: string): void {
    const accessPolicy = this.context.accessPolicy;
    if (!accessPolicy?.resource) {
      return;
    }

    const expressions: Expression[] = [];

    for (const policy of accessPolicy.resource) {
      if (policy.resourceType === resourceType || policy.resourceType === '*') {
        const policyCompartmentId = resolveId(policy.compartment);
        if (policyCompartmentId) {
          // Deprecated - to be removed
          // Add compartment restriction for the access policy.
          expressions.push(new Condition('compartments', 'ARRAY_CONTAINS', policyCompartmentId, 'UUID[]'));
        } else if (policy.criteria) {
          if (!policy.criteria.startsWith(policy.resourceType + '?')) {
            getLogger().warn('Invalid access policy criteria', {
              accessPolicy: accessPolicy.id,
              resourceType: policy.resourceType,
              criteria: policy.criteria,
            });
            return; // Ignore invalid access policy criteria
          }

          // Add subquery for access policy criteria.
          let criteria = policy.criteria;
          if (policy.resourceType === '*') {
            const queryIndex = criteria.indexOf('?');
            criteria = resourceType + '?' + criteria.slice(queryIndex + 1);
          }
          const searchRequest = parseSearchRequest(criteria);
          const accessPolicyExpression = buildSearchExpression(
            this,
            builder,
            searchRequest.resourceType,
            searchRequest
          );
          if (accessPolicyExpression) {
            expressions.push(accessPolicyExpression);
          }
        } else {
          // Allow access to all resources in the compartment.
          return;
        }
      }
    }

    if (expressions.length > 0) {
      builder.predicate.expressions.push(new Disjunction(expressions));
    }
  }

  private buildResourceRow(resource: Resource): Record<string, any> {
    const resourceType = resource.resourceType;
    const meta = resource.meta as Meta;
    const compartments = meta.compartment?.map((ref) => resolveId(ref));
    const content = stringify(resource);

    const row: Record<string, any> = {
      id: resource.id,
      lastUpdated: meta.lastUpdated,
      deleted: false,
      projectId: meta.project,
      compartments,
      content,
    };

    const searchParams = getSearchParameters(resourceType);
    if (searchParams) {
      for (const searchParam of Object.values(searchParams)) {
        this.buildColumn(resource, row, searchParam);
      }
    }
    return row;
  }

  /**
   * Writes the resource to the resource table.
   * This builds all search parameter columns.
   * This does *not* write the version to the history table.
   * @param client - The database client inside the transaction.
   * @param resource - The resource.
   */
  private async writeResource(client: PoolClient, resource: Resource): Promise<void> {
    await new InsertQuery(resource.resourceType, [this.buildResourceRow(resource)]).mergeOnConflict().execute(client);
  }

  private async batchWriteResources(client: PoolClient, resources: Resource[]): Promise<void> {
    if (!resources.length) {
      return;
    }

    await new InsertQuery(
      resources[0].resourceType,
      resources.map((r) => this.buildResourceRow(r))
    )
      .mergeOnConflict()
      .execute(client);
  }

  /**
   * Writes a version of the resource to the resource history table.
   * @param client - The database client inside the transaction.
   * @param resource - The resource.
   */
  private async writeResourceVersion(client: PoolClient, resource: Resource): Promise<void> {
    const resourceType = resource.resourceType;
    const meta = resource.meta as Meta;
    const content = stringify(resource);

    await new InsertQuery(resourceType + '_History', [
      {
        id: resource.id,
        versionId: meta.versionId,
        lastUpdated: meta.lastUpdated,
        content,
      },
    ]).execute(client);
  }

  /**
   * Builds a list of compartments for the resource for writing.
   * FHIR compartments are used for two purposes.
   * 1) Search narrowing (i.e., /Patient/123/Observation searches within the patient compartment).
   * 2) Access controls.
   * @param resource - The resource.
   * @returns The list of compartments for the resource.
   */
  private getCompartments(resource: Resource): Reference[] {
    const compartments = new Set<string>();

    if (resource.meta?.project && validator.isUUID(resource.meta.project)) {
      // Deprecated - to be removed after migrating all tables to use "projectId" column
      compartments.add('Project/' + resource.meta.project);
    }

    if (
      resource.resourceType === 'User' &&
      resource.project?.reference &&
      validator.isUUID(resolveId(resource.project) ?? '')
    ) {
      // Deprecated - to be removed after migrating all tables to use "projectId" column
      compartments.add(resource.project.reference);
    }

    if (resource.meta?.accounts) {
      for (const account of resource.meta.accounts) {
        const id = resolveId(account);
        if (!account.reference?.startsWith('Project/') && id && validator.isUUID(id)) {
          compartments.add(account.reference as string);
        }
      }
    } else if (resource.meta?.account && !resource.meta.account.reference?.startsWith('Project/')) {
      const id = resolveId(resource.meta.account);
      if (id && validator.isUUID(id)) {
        compartments.add(resource.meta.account.reference as string);
      }
    }

    for (const patient of getPatients(resource)) {
      const patientId = resolveId(patient);
      if (patientId && validator.isUUID(patientId)) {
        compartments.add(patient.reference);
      }
    }

    // Carry forward anything added to the resource compartments array
    if (resource.meta?.compartment?.length) {
      for (const compartment of resource.meta.compartment) {
        const id = resolveId(compartment);
        if (
          id &&
          validator.isUUID(id) &&
          (compartment.reference?.startsWith('Organization/') || compartment.reference?.startsWith('Location/'))
        ) {
          compartments.add(compartment.reference as string);
        }
      }
    }

    const results: Reference[] = [];
    for (const reference of compartments.values()) {
      results.push({ reference });
    }

    return results;
  }

  /**
   * Builds the columns to write for a given resource and search parameter.
   * If nothing to write, then no columns will be added.
   * Some search parameters can result in multiple columns (for example, Reference objects).
   * @param resource - The resource to write.
   * @param columns - The output columns to write.
   * @param searchParam - The search parameter definition.
   */
  private buildColumn(resource: Resource, columns: Record<string, any>, searchParam: SearchParameter): void {
    const impl = getSearchParameterImplementation(resource.resourceType, searchParam);

    if (
      searchParam.code === '_id' ||
      searchParam.code === '_lastUpdated' ||
      searchParam.code === '_compartment' ||
      searchParam.type === 'composite' ||
      impl.searchStrategy === 'lookup-table'
    ) {
      return;
    }

    const values = evalFhirPath(searchParam.expression as string, resource);
    let columnValue = null;

    if (values.length > 0) {
      if (impl.array) {
        columnValue = values.map((v) => this.buildColumnValue(searchParam, impl, v));
      } else {
        columnValue = this.buildColumnValue(searchParam, impl, values[0]);
      }
    }

    columns[impl.columnName] = columnValue;

    // Handle special case for "MeasureReport-period"
    // This is a trial for using "tstzrange" columns for date/time ranges.
    // Eventually, this special case will go away, and this will become the default behavior for all "date" search parameters.
    if (searchParam.id === 'MeasureReport-period') {
      columns['period_range'] = this.buildPeriodColumn(values[0]);
    }
  }

  /**
   * Builds a single value for a given search parameter.
   * If the search parameter is an array, then this method will be called for each element.
   * If the search parameter is not an array, then this method will be called for the value.
   * @param searchParam - The search parameter definition.
   * @param details - The extra search parameter details.
   * @param value - The FHIR resource value.
   * @returns The column value.
   */
  private buildColumnValue(searchParam: SearchParameter, details: SearchParameterDetails, value: any): any {
    if (details.type === SearchParameterType.BOOLEAN) {
      return value === true || value === 'true';
    }

    if (details.type === SearchParameterType.DATE) {
      return this.buildDateColumn(value);
    }

    if (details.type === SearchParameterType.DATETIME) {
      return this.buildDateTimeColumn(value);
    }

    if (searchParam.type === 'quantity') {
      return this.buildQuantityColumn(value);
    }

    // Handle all string values specially to ensure they are truncated to the correct length
    let stringValue: string | undefined;
    if (searchParam.type === 'reference') {
      stringValue = this.buildReferenceColumns(value);
    } else if (searchParam.type === 'token') {
      stringValue = this.buildTokenColumn(value);
    } else {
      stringValue = typeof value === 'string' ? value : stringify(value);
    }

    if (!stringValue) {
      return undefined;
    }

    return truncateTextColumn(stringValue);
  }

  /**
   * Builds the column value for a date parameter.
   * Tries to parse the date string.
   * Silently ignores failure.
   * @param value - The FHIRPath result.
   * @returns The date string if parsed; undefined otherwise.
   */
  private buildDateColumn(value: any): string | undefined {
    // "Date" column is a special case that only applies when the following conditions are true:
    // 1. The search parameter is a date type.
    // 2. The underlying FHIR ElementDefinition referred to by the search parameter has a type of "date".
    if (typeof value === 'string') {
      try {
        const date = new Date(value);
        return date.toISOString().substring(0, 10);
      } catch (_err) {
        // Silent ignore
      }
    }
    return undefined;
  }

  /**
   * Builds the column value for a date/time parameter.
   * Tries to parse the date string.
   * Silently ignores failure.
   * @param value - The FHIRPath result.
   * @returns The date/time string if parsed; undefined otherwise.
   */
  private buildDateTimeColumn(value: any): string | undefined {
    if (typeof value === 'string') {
      try {
        const date = new Date(value);
        return date.toISOString();
      } catch (_err) {
        // Silent ignore
      }
    } else if (typeof value === 'object') {
      // Can be a Period
      if ('start' in value) {
        return this.buildDateTimeColumn(value.start);
      }
      if ('end' in value) {
        return this.buildDateTimeColumn(value.end);
      }
    }
    return undefined;
  }

  /**
   * Builds the column value for a "date" search parameter.
   * This is currently in trial mode. The intention is for this to replace all "date" and "date/time" search parameters.
   * @param value - The FHIRPath result value.
   * @returns The period column string value.
   */
  private buildPeriodColumn(value: any): string | undefined {
    const period = toPeriod(value);
    if (period) {
      return periodToRangeString(period);
    }
    return undefined;
  }

  /**
   * Builds the columns to write for a Reference value.
   * @param value - The property value of the reference.
   * @returns The reference column value.
   */
  private buildReferenceColumns(value: any): string | undefined {
    if (!value) {
      return undefined;
    }
    if (typeof value === 'string') {
      // Handle "canonical" properties such as QuestionnaireResponse.questionnaire
      // This is a reference string that is not a FHIR reference
      return value;
    }
    if (typeof value === 'object') {
      if (isReference(value)) {
        // Handle normal "reference" properties
        return value.reference;
      }
      if (isResource(value) && value.id) {
        // Handle inline references
        return getReferenceString(value);
      }
      if (typeof value.identifier === 'object') {
        // Handle logical (identifier-only) references by putting a placeholder in the column
        // NOTE(mattwiller 2023-11-01): This is done to enable searches using the :missing modifier;
        // actual identifier search matching is handled by the `<ResourceType>_Token` lookup tables
        return `identifier:${value.identifier.system}|${value.identifier.value}`;
      }
    }
    return undefined;
  }

  /**
   * Builds the column value to write a "code" search parameter.
   * The common cases are:
   *  1) The property value is a string, so return directly.
   *  2) The property value is a CodeableConcept.
   *  3) Otherwise fallback to stringify.
   * @param value - The property value of the code.
   * @returns The value to write to the database column.
   */
  private buildTokenColumn(value: any): string | undefined {
    if (!value) {
      return undefined;
    }

    if (typeof value === 'string') {
      // If the value is a string, return the value directly
      return value;
    }

    if (typeof value === 'object') {
      const codeableConceptValue = this.buildCodeableConceptColumn(value);
      if (codeableConceptValue) {
        return codeableConceptValue;
      }
    }

    // Otherwise, return a stringified version of the value
    return stringify(value);
  }

  /**
   * Builds a CodeableConcept column value.
   * @param value - The property value of the code.
   * @returns The value to write to the database column.
   */
  private buildCodeableConceptColumn(value: any): string | undefined {
    // If the value is a CodeableConcept,
    // then use the following logic to determine the code:
    // 1) value.coding[0].code
    // 2) value.coding[0].display
    // 3) value.text
    if ('coding' in value) {
      const coding = value.coding;
      if (Array.isArray(coding) && coding.length > 0) {
        if (coding[0].code) {
          return coding[0].code;
        }

        if (coding[0].display) {
          return coding[0].display;
        }
      }
    }

    if ('text' in value) {
      return value.text as string;
    }

    return undefined;
  }

  /**
   * Builds a Quantity column value.
   * @param value - The property value of the quantity.
   * @returns The numeric value if available; undefined otherwise.
   */
  private buildQuantityColumn(value: any): number | undefined {
    if (typeof value === 'object') {
      if ('value' in value) {
        const num = value.value;
        if (typeof num === 'number') {
          return num;
        }
      }
    }
    return undefined;
  }

  /**
   * Writes resources values to the lookup tables.
   * @param client - The database client inside the transaction.
   * @param resource - The resource to index.
   * @param create - If true, then the resource is being created.
   */
  private async writeLookupTables(client: PoolClient, resource: Resource, create: boolean): Promise<void> {
    await Promise.all(lookupTables.map((lookupTable) => lookupTable.indexResource(client, resource, create)));
  }

  /**
   * Deletes values from lookup tables.
   * @param client - The database client inside the transaction.
   * @param resource - The resource to delete.
   */
  private async deleteFromLookupTables(client: Pool | PoolClient, resource: Resource): Promise<void> {
    for (const lookupTable of lookupTables) {
      await lookupTable.deleteValuesForResource(client, resource);
    }
  }

  /**
   * Returns the last updated timestamp for the resource.
   * During historical data migration, some client applications are allowed
   * to override the timestamp.
   * @param existing - Existing resource if one exists.
   * @param resource - The FHIR resource.
   * @returns The last updated date.
   */
  private getLastUpdated(existing: Resource | undefined, resource: Resource): string {
    if (!existing) {
      // If the resource has a specified "lastUpdated",
      // and there is no existing version,
      // and the current context is a ClientApplication (i.e., OAuth client credentials),
      // then allow the ClientApplication to set the date.
      const lastUpdated = resource.meta?.lastUpdated;
      if (lastUpdated && this.canWriteProtectedMeta()) {
        return lastUpdated;
      }
    }

    // Otherwise, use "now"
    return new Date().toISOString();
  }

  /**
   * Returns the project ID for the resource.
   * If it is a public resource type, then returns the public project ID.
   * If it is a protected resource type, then returns the Medplum project ID.
   * Otherwise, by default, return the current context project ID.
   * @param existing - Existing resource if one exists.
   * @param updated - The FHIR resource.
   * @returns The project ID.
   */
  private getProjectId(existing: Resource | undefined, updated: Resource): string | undefined {
    if (updated.resourceType === 'Project') {
      return updated.id;
    }

    if (updated.resourceType === 'ProjectMembership') {
      return resolveId(updated.project);
    }

    if (updated.resourceType === 'User' && this.isSuperAdmin()) {
      // Super admins can add, remove, and the project compartment of users.
      return updated?.meta?.project;
    }

    if (protectedResourceTypes.includes(updated.resourceType)) {
      return undefined;
    }

    const submittedProjectId = updated.meta?.project;
    if (submittedProjectId && this.canWriteProtectedMeta()) {
      // If the resource has an project (whether provided or from existing),
      // and the current context is allowed to write meta,
      // then use the provided value.
      return submittedProjectId;
    }

    return existing?.meta?.project ?? this.context.projects?.[0];
  }

  /**
   * Returns the author reference.
   * If the current context is allowed to write meta,
   * and the provided resource includes an author reference,
   * then use the provided value.
   * Otherwise uses the current context profile.
   * @param resource - The FHIR resource.
   * @returns The author value.
   */
  private getAuthor(resource: Resource): Reference {
    // If the resource has an author (whether provided or from existing),
    // and the current context is allowed to write meta,
    // then use the provided value.
    const author = resource.meta?.author;
    if (author && this.canWriteProtectedMeta()) {
      return author;
    }

    return this.context.author;
  }

  /**
   * Returns the author reference string (resourceType/id).
   * If the current context is a ClientApplication, handles "on behalf of".
   * Otherwise uses the current context profile.
   * @param existing - Current (soon to be previous) resource, if one exists.
   * @param updated - The incoming updated resource.
   * @returns The account values.
   */
  private async getAccounts(existing: Resource | undefined, updated: Resource): Promise<Reference[] | undefined> {
    const updatedAccounts = this.extractAccountReferences(updated.meta);
    if (updatedAccounts && this.canWriteAccount()) {
      // If the user specifies an account, allow it if they have permission.
      return updatedAccounts;
    }

    const accounts = new Set<string>();
    if (!existing && this.context.accessPolicy?.compartment?.reference) {
      // If the creator's access policy specifies a compartment, then use it as the account.
      // The writer's access policy is only applied at resource creation: simply editing a
      // resource does NOT pull it into the user's account.
      accounts.add(this.context.accessPolicy.compartment.reference);
    }

    if (updated.resourceType === 'Patient') {
      // When examining a Patient resource, we only look at the individual patient
      // We should not call `getPatients` and `readReference`
      const existingAccounts = this.extractAccountReferences(existing?.meta);
      if (existingAccounts?.length) {
        for (const account of existingAccounts) {
          accounts.add(account.reference as string);
        }
      }
    } else {
      const systemRepo = getSystemRepo(this.conn); // Re-use DB connection to preserve transaction state
      const patients = await systemRepo.readReferences(getPatients(updated));
      for (const patient of patients) {
        if (patient instanceof Error) {
          getLogger().debug('Error setting patient compartment', patient);
          continue;
        }

        // If the patient has an account, then use it as the resource account.
        const patientAccounts = this.extractAccountReferences(patient.meta);
        if (patientAccounts?.length) {
          for (const account of patientAccounts) {
            if (account.reference) {
              accounts.add(account.reference);
            }
          }
        }
      }
    }

    if (accounts.size < 1) {
      return undefined;
    }

    const result: Reference[] = [];
    for (const reference of accounts) {
      result.push({ reference });
    }
    return result;
  }

  private extractAccountReferences(meta: Meta | undefined): Reference[] | undefined {
    if (!meta) {
      return undefined;
    }
    if (meta.accounts && meta.account) {
      const accounts = meta.accounts;
      if (accounts.some((a) => a.reference === meta.account?.reference)) {
        return accounts;
      }
      return [meta.account, ...accounts];
    } else {
      return arrayify(meta.accounts ?? meta.account);
    }
  }

  /**
   * Determines if the current user can manually set the ID field.
   * This is very powerful, and reserved for the system account.
   * @returns True if the current user can manually set the ID field.
   */
  private canSetId(): boolean {
    return this.isSuperAdmin();
  }

  /**
   * Determines if the current user can manually set certain protected meta fields
   * such as author, project, lastUpdated, etc.
   * @returns True if the current user can manually set protected meta fields.
   */
  private canWriteProtectedMeta(): boolean {
    return this.isSuperAdmin();
  }

  private canWriteAccount(): boolean {
    return this.isSuperAdmin() || this.isProjectAdmin();
  }

  /**
   * Determines if the current user can read the specified resource type.
   * @param resourceType - The resource type.
   * @returns True if the current user can read the specified resource type.
   */
  canReadResourceType(resourceType: string): boolean {
    if (this.isSuperAdmin()) {
      return true;
    }
    if (protectedResourceTypes.includes(resourceType)) {
      return false;
    }
    if (!this.context.accessPolicy) {
      return true;
    }
    return canReadResourceType(this.context.accessPolicy, resourceType as ResourceType);
  }

  /**
   * Determines if the current user can write the specified resource type.
   * This is a preliminary check before evaluating a write operation in depth.
   * If a user cannot write a resource type at all, then don't bother looking up previous versions.
   * @param resourceType - The resource type.
   * @returns True if the current user can write the specified resource type.
   */
  private canWriteResourceType(resourceType: string): boolean {
    if (this.isSuperAdmin()) {
      return true;
    }
    if (protectedResourceTypes.includes(resourceType)) {
      return false;
    }
    if (!this.context.accessPolicy) {
      return true;
    }
    return canWriteResourceType(this.context.accessPolicy, resourceType as ResourceType);
  }

  /**
   * Determines if the current user can write to the specified resource.
   * This is a more in-depth check after building the candidate result of a write operation.
   * @param resource - The resource.
   * @returns True if the current user can write the specified resource type.
   */
  private canWriteToResource(resource: Resource): boolean {
    if (this.isSuperAdmin()) {
      return true;
    }
    const resourceType = resource.resourceType;
    if (protectedResourceTypes.includes(resourceType)) {
      return false;
    }
    if (resource.meta?.project !== this.context.projects?.[0]) {
      return false;
    }
    return !!satisfiedAccessPolicy(resource, AccessPolicyInteraction.UPDATE, this.context.accessPolicy);
  }

  /**
   * Check that a resource can be written in its current form.
   * @param previous - The resource before updates were applied.
   * @param current - The resource as it will be written.
   * @returns True if the current user can write the specified resource type.
   */
  private isResourceWriteable(previous: Resource | undefined, current: Resource): boolean {
    if (this.isSuperAdmin()) {
      return true;
    }

    if (current.meta?.project !== this.context.projects?.[0]) {
      return false;
    }

    const matchingPolicy = satisfiedAccessPolicy(current, AccessPolicyInteraction.UPDATE, this.context.accessPolicy);
    if (!matchingPolicy) {
      return false;
    }
    if (matchingPolicy?.writeConstraint) {
      return matchingPolicy.writeConstraint.every((constraint) => {
        const invariant = evalFhirPathTyped(
          constraint.expression as string,
          [{ type: current.resourceType, value: current }],
          {
            '%before': { type: previous?.resourceType ?? 'undefined', value: previous },
            '%after': { type: current.resourceType, value: current },
          }
        );
        return invariant.length === 1 && invariant[0].value === true;
      });
    }
    return true;
  }

  /**
   * Returns true if the resource is "cache only" and not written to the database.
   * This is a highly specialized use case for internal system resources.
   * @param resource - The candidate resource.
   * @returns True if the resource should be cached only and not written to the database.
   */
  private isCacheOnly(resource: Resource): boolean {
    if (resource.resourceType === 'Login' && (resource.authMethod === 'client' || resource.authMethod === 'execute')) {
      return true;
    }
    if (resource.resourceType === 'Subscription' && resource.channel?.type === 'websocket') {
      return true;
    }
    return false;
  }

  /**
   * Removes hidden fields from a resource as defined by the access policy.
   * This should be called for any "read" operation.
   * @param input - The input resource.
   * @returns The resource with hidden fields removed.
   */
  removeHiddenFields<T extends Resource>(input: T): T {
    const policy = satisfiedAccessPolicy(input, AccessPolicyInteraction.READ, this.context.accessPolicy);
    if (policy?.hiddenFields) {
      for (const field of policy.hiddenFields) {
        this.removeField(input, field);
      }
    }
    if (!this.context.extendedMode) {
      const meta = input.meta as Meta;
      meta.author = undefined;
      meta.project = undefined;
      meta.account = undefined;
      meta.compartment = undefined;
    }
    return input;
  }

  /**
   * Overwrites readonly fields from a resource as defined by the access policy.
   * If no original (i.e., this is the first version), then blank them out.
   * This should be called for any "write" operation.
   * @param input - The input resource.
   * @param original - The previous version, if it exists.
   * @returns The resource with restored hidden fields.
   */
  private restoreReadonlyFields<T extends Resource>(input: T, original: T | undefined): T {
    const policy = satisfiedAccessPolicy(
      original ?? input,
      original ? AccessPolicyInteraction.UPDATE : AccessPolicyInteraction.CREATE,
      this.context.accessPolicy
    );
    if (!policy?.readonlyFields && !policy?.hiddenFields) {
      return input;
    }
    const fieldsToRestore = [];
    if (policy.readonlyFields) {
      fieldsToRestore.push(...policy.readonlyFields);
    }
    if (policy.hiddenFields) {
      fieldsToRestore.push(...policy.hiddenFields);
    }
    for (const field of fieldsToRestore) {
      this.removeField(input, field);
      // only top-level fields can be restored.
      // choice-of-type fields technically aren't allowed in readonlyFields/hiddenFields,
      // but that isn't currently enforced at write time, so exclude them here
      if (original && !field.includes('.') && !field.endsWith('[x]')) {
        const value = original[field as keyof T];
        if (value) {
          input[field as keyof T] = value;
        }
      }
    }
    return input;
  }

  /**
   * Removes a field from the input resource; supports nested fields.
   * @param input - The input resource.
   * @param path - The path to the field to remove
   */
  private removeField<T extends Resource>(input: T, path: string): void {
    let last: any[] = [input];
    const pathParts = path.split('.');
    for (let i = 0; i < pathParts.length; i++) {
      const pathPart = pathParts[i];

      if (i === pathParts.length - 1) {
        // final key part
        last.forEach((item) => {
          resolveFieldName(item, pathPart).forEach((k) => {
            delete item[k];
          });
        });
      } else {
        // intermediate key part
        const next: any[] = [];
        for (const lastItem of last) {
          for (const k of resolveFieldName(lastItem, pathPart)) {
            if (lastItem[k] !== undefined) {
              if (Array.isArray(lastItem[k])) {
                next.push(...lastItem[k]);
              } else if (isObject(lastItem[k])) {
                next.push(lastItem[k]);
              }
            }
          }
        }
        last = next;
      }
    }
  }

  isSuperAdmin(): boolean {
    return !!this.context.superAdmin;
  }

  isProjectAdmin(): boolean {
    return !!this.context.projectAdmin;
  }

  /**
   * Logs an AuditEvent for a restful operation.
   * @param subtype - The AuditEvent subtype.
   * @param outcome - The AuditEvent outcome.
   * @param description - The description.  Can be a string, object, or Error.  Will be normalized to a string.
   * @param options -
   * @param options.resource - Optional resource to associate with the AuditEvent.
   * @param options.searchRequest - Optional search parameters to associate with the AuditEvent.
   * @param options.durationMs - Duration of the operation, used for generating metrics.
   */
  private logEvent(
    subtype: AuditEventSubtype,
    outcome: AuditEventOutcome,
    description?: unknown,
    options?: {
      resource?: Resource | Reference;
      searchRequest?: SearchRequest;
      durationMs?: number;
    }
  ): void {
    if (this.context.author.reference === 'system') {
      // Don't log system events.
      return;
    }
    let outcomeDesc: string | undefined = undefined;
    if (description) {
      outcomeDesc = normalizeErrorString(description);
    }
    let query: string | undefined = undefined;
    if (options?.searchRequest) {
      query = options.searchRequest.resourceType + formatSearchQuery(options.searchRequest);
    }
    const resource = options?.resource;

    const auditEvent = createAuditEvent(
      RestfulOperationType,
      subtype,
      this.context.projects?.[0] as string,
      this.context.author,
      this.context.remoteAddress,
      outcome,
      {
        description: outcomeDesc,
        resource,
        searchQuery: query,
        durationMs: options?.durationMs,
      }
    );
    logAuditEvent(auditEvent);

    if (options?.durationMs && outcome === AuditEventOutcome.Success) {
      const duration = options.durationMs / 1000; // Report duration in whole seconds
      recordHistogramValue('medplum.fhir.interaction.' + subtype.code, duration, {
        attributes: {
          resourceType: isResource(resource) ? resource?.resourceType : undefined,
        },
      });
    }
    incrementCounter(`medplum.fhir.interaction.${subtype.code}.count`, {
      attributes: {
        resourceType: isResource(resource) ? resource?.resourceType : undefined,
        result: outcome === AuditEventOutcome.Success ? 'success' : 'failure',
      },
    });

    if (getConfig().saveAuditEvents && isResource(resource) && resource?.resourceType !== 'AuditEvent') {
      auditEvent.id = this.generateId();
      this.updateResourceImpl(auditEvent, true).catch(console.error);
    }
  }

  /**
   * Returns a database client.
   * Use this method when you don't care if you're in a transaction or not.
   * For example, use this method for "read by ID".
   * The return value can either be a pool client or a pool.
   * If in a transaction, then returns the transaction client (PoolClient).
   * Otherwise, returns the pool (Pool).
   * @param mode - The database mode.
   * @returns The database client.
   */
  getDatabaseClient(mode: DatabaseMode): Pool | PoolClient {
    this.assertNotClosed();
    if (this.conn) {
      // If in a transaction, then use the transaction client.
      return this.conn;
    }
    if (mode === DatabaseMode.WRITER) {
      // If we ever use a writer, then all subsequent operations must use a writer.
      this.mode = RepositoryMode.WRITER;
    }
    return getDatabasePool(this.mode === RepositoryMode.WRITER ? DatabaseMode.WRITER : mode);
  }

  /**
   * Returns a proper database connection.
   * Unlike getDatabaseClient(), this method always returns a PoolClient.
   * @param mode - The database mode.
   * @returns Database connection.
   */
  private async getConnection(mode: DatabaseMode): Promise<PoolClient> {
    this.assertNotClosed();
    if (!this.conn) {
      this.conn = await getDatabasePool(mode).connect();
    }
    return this.conn;
  }

  /**
   * Releases the database connection.
   * Include an error to remove the connection from the pool.
   * See: https://github.com/brianc/node-postgres/blob/master/packages/pg-pool/index.js#L333
   * @param err - Optional error to remove the connection from the pool.
   */
  private releaseConnection(err?: boolean | Error): void {
    if (this.conn) {
      this.conn.release(err);
      this.conn = undefined;
    }
  }

  async withTransaction<TResult>(
    callback: (client: PoolClient) => Promise<TResult>,
    options?: { serializable: boolean }
  ): Promise<TResult> {
    let error: OperationOutcomeError | undefined;
    for (let i = 0; i < transactionAttempts; i++) {
      try {
        const client = await this.beginTransaction(options?.serializable ? 'SERIALIZABLE' : undefined);
        const result = await callback(client);
        await this.commitTransaction();
        return result;
      } catch (err) {
        const operationOutcomeError = normalizeDatabaseError(err);
        // Assigning here and throwing below is necessary to satisfy TypeScript
        error = operationOutcomeError;

        // Ensure transaction is rolled back before attempting any retry
        await this.rollbackTransaction(operationOutcomeError);
        if (!this.isRetryableTransactionError(operationOutcomeError)) {
          break; // Fall through to throw statement outside of the loop
        }
      } finally {
        this.endTransaction();
      }
    }

    // Cannot be undefined: either the function returns normally from the `try` block,
    // or `error` is assigned at top of `catch` block before reaching this line
    throw error;
  }

  private async beginTransaction(isolationLevel: TransactionIsolationLevel = 'REPEATABLE READ'): Promise<PoolClient> {
    this.assertNotClosed();
    this.transactionDepth++;
    const conn = await this.getConnection(DatabaseMode.WRITER);
    if (this.transactionDepth === 1) {
      await conn.query('BEGIN ISOLATION LEVEL ' + isolationLevel);
    } else {
      await conn.query('SAVEPOINT sp' + this.transactionDepth);
    }
    return conn;
  }

  private async commitTransaction(): Promise<void> {
    this.assertInTransaction();
    const conn = await this.getConnection(DatabaseMode.WRITER);
    if (this.transactionDepth === 1) {
      await this.processPreCommit();
      await conn.query('COMMIT');
      this.transactionDepth--;
      this.releaseConnection();
      await this.processPostCommit();
    } else {
      await conn.query('RELEASE SAVEPOINT sp' + this.transactionDepth);
      this.transactionDepth--;
    }
  }

  private async rollbackTransaction(error: Error): Promise<void> {
    this.assertInTransaction();
    const conn = await this.getConnection(DatabaseMode.WRITER);
    if (this.transactionDepth === 1) {
      await conn.query('ROLLBACK');
      this.transactionDepth--;
      this.releaseConnection(error);
    } else {
      await conn.query('ROLLBACK TO SAVEPOINT sp' + this.transactionDepth);
      this.transactionDepth--;
    }
  }

  private endTransaction(): void {
    if (this.transactionDepth === 0) {
      this.releaseConnection();
    }
  }

  private assertInTransaction(): void {
    if (this.transactionDepth <= 0) {
      throw new Error('Not in transaction');
    }
  }

  async preCommit(fn: () => Promise<void>): Promise<void> {
    if (this.transactionDepth) {
      this.preCommitCallbacks.push(fn);
    } else {
      await fn();
    }
  }

  private async processPreCommit(): Promise<void> {
    const callbacks = this.preCommitCallbacks;
    this.preCommitCallbacks = [];
    for (const cb of callbacks) {
      await cb();
    }
  }

  async postCommit(fn: () => Promise<void>): Promise<void> {
    if (this.transactionDepth) {
      this.postCommitCallbacks.push(fn);
    } else {
      await fn();
    }
  }

  private async processPostCommit(): Promise<void> {
    const callbacks = this.postCommitCallbacks;
    this.postCommitCallbacks = [];
    for (const cb of callbacks) {
      await cb();
    }
  }

  /**
   * Checks whether an error represents a serialization conflict that can safely be retried.
   * NOTE: Retrying a transaction must be done in full: the entire `Repository.withTransaction()` block
   * should be re-executed, in a new transaction.
   * @param err - The error to check.
   * @returns True if the error indicates a retryable transaction failure.
   */
  private isRetryableTransactionError(err: OperationOutcomeError): boolean {
    if (this.transactionDepth) {
      // Nested transactions (i.e. savepoints) are NOT retryable per the Postgres docs;
      // the entire transaction must have been rolled back before anything can be retried:
      // "It is important to retry the complete transaction, including all logic
      // that decides which SQL to issue and/or which values to use"
      // @see https://www.postgresql.org/docs/16/mvcc-serialization-failure-handling.html
      return false;
    }
    if (err.outcome.issue.length !== 1) {
      // Multiple errors combined cannot be guaranteed to be retryable
      return false;
    }

    const issue = err.outcome.issue[0];
    return Boolean(
      issue.code === 'conflict' &&
        issue.details?.coding?.some((c) => retryableTransactionErrorCodes.includes(c.code as string))
    );
  }

  /**
   * Tries to read a cache entry from Redis by resource type and ID.
   * @param resourceType - The resource type.
   * @param id - The resource ID.
   * @returns The cache entry if found; otherwise, undefined.
   */
  private async getCacheEntry<T extends Resource>(
    resourceType: string,
    id: string
  ): Promise<CacheEntry<T> | undefined> {
    // No cache access allowed mid-transaction
    if (this.transactionDepth) {
      return undefined;
    }
    const cachedValue = await getRedis().get(getCacheKey(resourceType, id));
    return cachedValue ? (JSON.parse(cachedValue) as CacheEntry<T>) : undefined;
  }

  /**
   * Performs a bulk read of cache entries from Redis.
   * @param references - Array of FHIR references.
   * @returns Array of cache entries or undefined.
   */
  private async getCacheEntries(references: Reference[]): Promise<(CacheEntry | undefined)[]> {
    // No cache access allowed mid-transaction
    if (this.transactionDepth) {
      return new Array(references.length);
    }
    const referenceKeys = references.map((r) => r.reference as string);
    if (referenceKeys.length === 0) {
      // Return early to avoid calling mget() with no args, which is an error
      return [];
    }
    return (await getRedis().mget(referenceKeys)).map((cachedValue) =>
      cachedValue ? (JSON.parse(cachedValue) as CacheEntry) : undefined
    );
  }

  /**
   * Writes a cache entry to Redis.
   * @param resource - The resource to cache.
   */
  private async setCacheEntry(resource: Resource): Promise<void> {
    // No cache access allowed mid-transaction
    if (this.transactionDepth) {
      const cachedResource = deepClone(resource);
      await this.postCommit(() => {
        return this.setCacheEntry(cachedResource);
      });
      return;
    }

    const projectId = resource.meta?.project;
    await getRedis().set(
      getCacheKey(resource.resourceType, resource.id as string),
      stringify({ resource, projectId }),
      'EX',
      REDIS_CACHE_EX_SECONDS
    );
  }

  /**
   * Deletes a cache entry from Redis.
   * @param resourceType - The resource type.
   * @param id - The resource ID.
   */
  private async deleteCacheEntry(resourceType: string, id: string): Promise<void> {
    // No cache access allowed mid-transaction
    if (this.transactionDepth) {
      await this.postCommit(() => this.deleteCacheEntry(resourceType, id));
      return;
    }

    await getRedis().del(getCacheKey(resourceType, id));
  }

  /**
   * Deletes cache entries from Redis.
   * @param resourceType - The resource type.
   * @param ids - The resource IDs.
   */
  private async deleteCacheEntries(resourceType: string, ids: string[]): Promise<void> {
    // No cache access allowed mid-transaction
    if (this.transactionDepth) {
      await this.postCommit(() => this.deleteCacheEntries(resourceType, ids));
      return;
    }

    const cacheKeys = ids.map((id) => {
      return getCacheKey(resourceType, id);
    });

    await getRedis().del(cacheKeys);
  }

  async ensureInTransaction<TResult>(callback: (client: PoolClient) => Promise<TResult>): Promise<TResult> {
    if (this.transactionDepth) {
      const client = await this.getConnection(DatabaseMode.WRITER);
      return callback(client);
    } else {
      return this.withTransaction(callback);
    }
  }

  getConfig(): RepositoryContext {
    return this.context;
  }

  [Symbol.dispose](): void {
    this.assertNotClosed();
    if (this.disposable) {
      if (this.transactionDepth > 0) {
        // Bad state, remove connection from pool
        getLogger().error('Closing Repository with active transaction');
        this.releaseConnection(new Error('Closing Repository with active transaction'));
      } else {
        // Good state, return healthy connection to pool
        this.releaseConnection();
      }
    }
    this.closed = true;
  }

  private assertNotClosed(): void {
    if (this.closed) {
      throw new Error('Already closed');
    }
  }
}

const REDIS_CACHE_EX_SECONDS = 24 * 60 * 60; // 24 hours in seconds
const PROFILE_CACHE_EX_SECONDS = 5 * 60; // 5 minutes in seconds

/**
 * Returns the redis cache key for the given resource type and resource ID.
 * @param resourceType - The resource type.
 * @param id - The resource ID.
 * @returns The Redis cache key.
 */
function getCacheKey(resourceType: string, id: string): string {
  return `${resourceType}/${id}`;
}

/**
 * Writes a FHIR profile cache entry to Redis.
 * @param profile - The profile structure definition.
 */
async function cacheProfile(profile: StructureDefinition): Promise<void> {
  if (!profile.url || !profile.meta?.project) {
    return;
  }
  profile = await getSystemRepo().readReference(createReference(profile));
  await getRedis().set(
    getProfileCacheKey(profile.meta?.project as string, profile.url),
    JSON.stringify({ resource: profile, projectId: profile.meta?.project }),
    'EX',
    PROFILE_CACHE_EX_SECONDS
  );
}

/**
 * Writes a FHIR profile cache entry to Redis.
 * @param profile - The profile structure definition.
 */
async function removeCachedProfile(profile: StructureDefinition): Promise<void> {
  if (!profile.url || !profile.meta?.project) {
    return;
  }
  await getRedis().del(getProfileCacheKey(profile.meta.project, profile.url));
}

/**
 * Returns the redis cache key for the given profile resource.
 * @param projectId - The ID of the Project to which the profile belongs.
 * @param url - The canonical URL of the profile.
 * @returns The Redis cache key.
 */
function getProfileCacheKey(projectId: string, url: string): string {
  return `Project/${projectId}/StructureDefinition/${url}`;
}

export function getSystemRepo(conn?: PoolClient): Repository {
  return new Repository(
    {
      superAdmin: true,
      strictMode: true,
      extendedMode: true,
      author: {
        reference: 'system',
      },
      // System repo does not have an associated Project; it can write to any
    },
    conn
  );
}

function lowercaseFirstLetter(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function resolveFieldName(input: any, fieldName: string): string[] {
  if (!fieldName.endsWith('[x]')) {
    return [fieldName];
  }

  const baseKey = fieldName.slice(0, -3);
  return Object.keys(input).filter((k) => {
    if (k.startsWith(baseKey)) {
      const maybePropertyType = k.substring(baseKey.length);
      if (maybePropertyType in PropertyType || lowercaseFirstLetter(maybePropertyType) in PropertyType) {
        return true;
      }
    }
    return false;
  });
}

export function setTypedPropertyValue(target: TypedValue, path: string, replacement: TypedValue): void {
  let patchPath = '/' + path.replaceAll(/\[|\]\.|\./g, '/');
  if (patchPath.endsWith(']')) {
    patchPath = patchPath.slice(0, -1);
  }
  patchObject(target.value, [{ op: 'replace', path: patchPath, value: replacement.value }]);
}

const textEncoder = new TextEncoder();

/**
 * Apply a maximum string length to ensure the value can accommodate the maximum
 * size for a btree index entry: 2704 bytes. If the string is too large,
 * be as conservative as possible to avoid write errors by truncating to 675 characters
 * to accommodate the entire string being 4-byte UTF-8 code points.
 * @param value - The column value to truncate.
 * @returns The possibly truncated column value.
 */
function truncateTextColumn(value: string): string {
  if (textEncoder.encode(value).length <= 2704) {
    return value;
  }

  return Array.from(value).slice(0, 675).join('');
}
