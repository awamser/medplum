import { deepClone } from '@medplum/core';
import { Patient, StructureDefinition } from '@medplum/fhirtypes';

type ProfileStructureDefinition = StructureDefinition & {
  url: string;
  name: string;
};
const SAMPLE_FISH_PATIENT: Patient = {
  resourceType: 'Patient',
  id: 'Shorty',
  meta: {
    profile: ['http://example.org/fhir/fish/StructureDefinition/fish-patient'],
  },
  extension: [
    {
      url: 'http://example.org/fhir/fish/StructureDefinition/fish-species',
      valueCodeableConcept: {
        coding: [
          {
            code: '47978005',
            system: 'http://snomed.info/sct',
            display: 'Carpiodes cyprinus (organism)',
          },
        ],
      },
    },
  ],
  name: [
    {
      given: ['Shorty'],
      family: 'Koi-Fish',
    },
  ],
};

const FISH_PATIENT_PROFILE_SD: ProfileStructureDefinition = {
  resourceType: 'StructureDefinition',
  id: 'fish-patient',
  url: 'http://example.org/fhir/fish/StructureDefinition/fish-patient',
  name: 'FishPatient',
  title: 'Fish Patient',
  status: 'draft',
  description: 'A patient that is a type of fish.',
  fhirVersion: '4.0.1',
  mapping: [
    {
      identity: 'rim',
      uri: 'http://hl7.org/v3',
      name: 'RIM Mapping',
    },
    {
      identity: 'cda',
      uri: 'http://hl7.org/v3/cda',
      name: 'CDA (R2)',
    },
    {
      identity: 'w5',
      uri: 'http://hl7.org/fhir/fivews',
      name: 'FiveWs Pattern Mapping',
    },
    {
      identity: 'v2',
      uri: 'http://hl7.org/v2',
      name: 'HL7 v2 Mapping',
    },
    {
      identity: 'loinc',
      uri: 'http://loinc.org',
      name: 'LOINC code for the element',
    },
  ],
  kind: 'resource',
  abstract: false,
  type: 'Patient',
  baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
  derivation: 'constraint',
  snapshot: {
    element: [
      {
        id: 'Patient',
        path: 'Patient',
        short: 'Information about an individual or animal receiving health care services',
        definition:
          'Demographics and other administrative information about an individual or animal receiving care or other health-related services.',
        alias: ['SubjectOfCare Client Resident'],
        min: 0,
        max: '*',
        base: {
          path: 'Patient',
          min: 0,
          max: '*',
        },
        constraint: [
          {
            key: 'dom-2',
            severity: 'error',
            human: 'If the resource is contained in another resource, it SHALL NOT contain nested Resources',
            expression: 'contained.contained.empty()',
            xpath: 'not(parent::f:contained and f:contained)',
            source: 'http://hl7.org/fhir/StructureDefinition/DomainResource',
          },
          {
            key: 'dom-3',
            severity: 'error',
            human:
              'If the resource is contained in another resource, it SHALL be referred to from elsewhere in the resource or SHALL refer to the containing resource',
            expression:
              "contained.where((('#'+id in (%resource.descendants().reference | %resource.descendants().as(canonical) | %resource.descendants().as(uri) | %resource.descendants().as(url))) or descendants().where(reference = '#').exists() or descendants().where(as(canonical) = '#').exists() or descendants().where(as(canonical) = '#').exists()).not()).trace('unmatched', id).empty()",
            xpath:
              "not(exists(for $id in f:contained/*/f:id/@value return $contained[not(parent::*/descendant::f:reference/@value=concat('#', $contained/*/id/@value) or descendant::f:reference[@value='#'])]))",
            source: 'http://hl7.org/fhir/StructureDefinition/DomainResource',
          },
          {
            key: 'dom-4',
            severity: 'error',
            human:
              'If a resource is contained in another resource, it SHALL NOT have a meta.versionId or a meta.lastUpdated',
            expression: 'contained.meta.versionId.empty() and contained.meta.lastUpdated.empty()',
            xpath: 'not(exists(f:contained/*/f:meta/f:versionId)) and not(exists(f:contained/*/f:meta/f:lastUpdated))',
            source: 'http://hl7.org/fhir/StructureDefinition/DomainResource',
          },
          {
            key: 'dom-5',
            severity: 'error',
            human: 'If a resource is contained in another resource, it SHALL NOT have a security label',
            expression: 'contained.meta.security.empty()',
            xpath: 'not(exists(f:contained/*/f:meta/f:security))',
            source: 'http://hl7.org/fhir/StructureDefinition/DomainResource',
          },
          {
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/elementdefinition-bestpractice',
                valueBoolean: true,
              },
              {
                url: 'http://hl7.org/fhir/StructureDefinition/elementdefinition-bestpractice-explanation',
                valueMarkdown:
                  'When a resource has no narrative, only systems that fully understand the data can display the resource to a human safely. Including a human readable representation in the resource makes for a much more robust eco-system and cheaper handling of resources by intermediary systems. Some ecosystems restrict distribution of resources to only those systems that do fully understand the resources, and as a consequence implementers may believe that the narrative is superfluous. However experience shows that such eco-systems often open up to new participants over time.',
              },
            ],
            key: 'dom-6',
            severity: 'warning',
            human: 'A resource should have narrative for robust management',
            expression: 'text.`div`.exists()',
            xpath: 'exists(f:text/h:div)',
            source: 'http://hl7.org/fhir/StructureDefinition/DomainResource',
          },
        ],
        isModifier: false,
        isSummary: false,
        mapping: [
          {
            identity: 'rim',
            map: 'Entity. Role, or Act',
          },
          {
            identity: 'rim',
            map: 'Patient[classCode=PAT]',
          },
          {
            identity: 'cda',
            map: 'ClinicalDocument.recordTarget.patientRole',
          },
        ],
      },
      {
        id: 'Patient.id',
        path: 'Patient.id',
        short: 'Logical id of this artifact',
        definition:
          'The logical id of the resource, as used in the URL for the resource. Once assigned, this value never changes.',
        comment:
          'The only time that a resource does not have an id is when it is being submitted to the server using a create operation.',
        min: 0,
        max: '1',
        base: {
          path: 'Resource.id',
          min: 0,
          max: '1',
        },
        type: [
          {
            code: 'http://hl7.org/fhirpath/System.String',
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/structuredefinition-fhir-type',
                valueUrl: 'string',
              },
            ],
          },
        ],
        isModifier: false,
        isSummary: true,
      },
      {
        id: 'Patient.meta',
        path: 'Patient.meta',
        short: 'Metadata about the resource',
        definition:
          'The metadata about the resource. This is content that is maintained by the infrastructure. Changes to the content might not always be associated with version changes to the resource.',
        min: 0,
        max: '1',
        base: {
          path: 'Resource.meta',
          min: 0,
          max: '1',
        },
        type: [
          {
            code: 'Meta',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: true,
      },
      {
        id: 'Patient.implicitRules',
        path: 'Patient.implicitRules',
        short: 'A set of rules under which this content was created',
        definition:
          'A reference to a set of rules that were followed when the resource was constructed, and which must be understood when processing the content. Often, this is a reference to an implementation guide that defines the special rules along with other profiles etc.',
        comment:
          "Asserting this rule set restricts the content to be only understood by a limited set of trading partners. This inherently limits the usefulness of the data in the long term. However, the existing health eco-system is highly fractured, and not yet ready to define, collect, and exchange data in a generally computable sense. Wherever possible, implementers and/or specification writers should avoid using this element. Often, when used, the URL is a reference to an implementation guide that defines these special rules as part of it's narrative along with other profiles, value sets, etc.",
        min: 0,
        max: '1',
        base: {
          path: 'Resource.implicitRules',
          min: 0,
          max: '1',
        },
        type: [
          {
            code: 'uri',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: true,
        isModifierReason:
          "This element is labeled as a modifier because the implicit rules may provide additional knowledge about the resource that modifies it's meaning or interpretation",
        isSummary: true,
      },
      {
        id: 'Patient.language',
        path: 'Patient.language',
        short: 'Language of the resource content',
        definition: 'The base language in which the resource is written.',
        comment:
          'Language is provided to support indexing and accessibility (typically, services such as text to speech use the language tag). The html language tag in the narrative applies  to the narrative. The language tag on the resource may be used to specify the language of other presentations generated from the data in the resource. Not all the content has to be in the base language. The Resource.language should not be assumed to apply to the narrative automatically. If a language is specified, it should it also be specified on the div element in the html (see rules in HTML5 for information about the relationship between xml:lang and the html lang attribute).',
        min: 0,
        max: '1',
        base: {
          path: 'Resource.language',
          min: 0,
          max: '1',
        },
        type: [
          {
            code: 'code',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: false,
        binding: {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/elementdefinition-maxValueSet',
              valueCanonical: 'http://hl7.org/fhir/ValueSet/all-languages',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/elementdefinition-bindingName',
              valueString: 'Language',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/elementdefinition-isCommonBinding',
              valueBoolean: true,
            },
          ],
          strength: 'preferred',
          description: 'A human language.',
          valueSet: 'http://hl7.org/fhir/ValueSet/languages',
        },
      },
      {
        id: 'Patient.text',
        path: 'Patient.text',
        short: 'Text summary of the resource, for human interpretation',
        definition:
          'A human-readable narrative that contains a summary of the resource and can be used to represent the content of the resource to a human. The narrative need not encode all the structured data, but is required to contain sufficient detail to make it "clinically safe" for a human to just read the narrative. Resource definitions may define what content should be represented in the narrative to ensure clinical safety.',
        comment:
          'Contained resources do not have narrative. Resources that are not contained SHOULD have a narrative. In some cases, a resource may only have text with little or no additional discrete data (as long as all minOccurs=1 elements are satisfied).  This may be necessary for data from legacy systems where information is captured as a "text blob" or where text is additionally entered raw or narrated and encoded information is added later.',
        alias: ['narrative', 'html', 'xhtml', 'display'],
        min: 0,
        max: '1',
        base: {
          path: 'DomainResource.text',
          min: 0,
          max: '1',
        },
        type: [
          {
            code: 'Narrative',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: false,
        mapping: [
          {
            identity: 'rim',
            map: 'Act.text?',
          },
        ],
      },
      {
        id: 'Patient.contained',
        path: 'Patient.contained',
        short: 'Contained, inline Resources',
        definition:
          'These resources do not have an independent existence apart from the resource that contains them - they cannot be identified independently, and nor can they have their own independent transaction scope.',
        comment:
          'This should never be done when the content can be identified properly, as once identification is lost, it is extremely difficult (and context dependent) to restore it again. Contained resources may have profiles and tags In their meta elements, but SHALL NOT have security labels.',
        alias: ['inline resources', 'anonymous resources', 'contained resources'],
        min: 0,
        max: '*',
        base: {
          path: 'DomainResource.contained',
          min: 0,
          max: '*',
        },
        type: [
          {
            code: 'Resource',
          },
        ],
        isModifier: false,
        isSummary: false,
        mapping: [
          {
            identity: 'rim',
            map: 'N/A',
          },
        ],
      },
      {
        id: 'Patient.extension',
        path: 'Patient.extension',
        slicing: {
          discriminator: [
            {
              type: 'value',
              path: 'url',
            },
          ],
          ordered: false,
          rules: 'open',
        },
        short: 'Additional content defined by implementations',
        definition:
          'May be used to represent additional information that is not part of the basic definition of the resource. To make the use of extensions safe and manageable, there is a strict set of governance  applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension.',
        comment:
          'There can be no stigma associated with the use of extensions by any application, project, or standard - regardless of the institution or jurisdiction that uses or defines the extensions.  The use of extensions is what allows the FHIR specification to retain a core level of simplicity for everyone.',
        alias: ['extensions', 'user content'],
        min: 0,
        max: '*',
        base: {
          path: 'DomainResource.extension',
          min: 0,
          max: '*',
        },
        type: [
          {
            code: 'Extension',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
          {
            key: 'ext-1',
            severity: 'error',
            human: 'Must have either extensions or value[x], not both',
            expression: 'extension.exists() != value.exists()',
            xpath: 'exists(f:extension)!=exists(f:*[starts-with(local-name(.), "value")])',
            source: 'http://hl7.org/fhir/StructureDefinition/Extension',
          },
        ],
        isModifier: false,
        isSummary: false,
        mapping: [
          {
            identity: 'rim',
            map: 'N/A',
          },
        ],
      },
      {
        id: 'Patient.extension:species',
        path: 'Patient.extension',
        sliceName: 'species',
        short: 'Additional content defined by implementations',
        definition: 'The species of the fish.',
        comment:
          'There can be no stigma associated with the use of extensions by any application, project, or standard - regardless of the institution or jurisdiction that uses or defines the extensions.  The use of extensions is what allows the FHIR specification to retain a core level of simplicity for everyone.',
        alias: ['extensions', 'user content'],
        min: 0,
        max: '1',
        base: {
          path: 'DomainResource.extension',
          min: 0,
          max: '*',
        },
        type: [
          {
            code: 'Extension',
            profile: ['http://example.org/fhir/fish/StructureDefinition/fish-species'],
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
          {
            key: 'ext-1',
            severity: 'error',
            human: 'Must have either extensions or value[x], not both',
            expression: 'extension.exists() != value.exists()',
            xpath: 'exists(f:extension)!=exists(f:*[starts-with(local-name(.), "value")])',
            source: 'http://hl7.org/fhir/StructureDefinition/Extension',
          },
        ],
        isModifier: false,
        isSummary: false,
        mapping: [
          {
            identity: 'rim',
            map: 'N/A',
          },
        ],
      },
      {
        id: 'Patient.modifierExtension',
        path: 'Patient.modifierExtension',
        short: 'Extensions that cannot be ignored',
        definition:
          "May be used to represent additional information that is not part of the basic definition of the resource and that modifies the understanding of the element that contains it and/or the understanding of the containing element's descendants. Usually modifier elements provide negation or qualification. To make the use of extensions safe and manageable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer is allowed to define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions.\n\nModifier extensions SHALL NOT change the meaning of any elements on Resource or DomainResource (including cannot change the meaning of modifierExtension itself).",
        comment:
          'There can be no stigma associated with the use of extensions by any application, project, or standard - regardless of the institution or jurisdiction that uses or defines the extensions.  The use of extensions is what allows the FHIR specification to retain a core level of simplicity for everyone.',
        requirements:
          'Modifier extensions allow for extensions that *cannot* be safely ignored to be clearly distinguished from the vast majority of extensions which can be safely ignored.  This promotes interoperability by eliminating the need for implementers to prohibit the presence of extensions. For further information, see the [definition of modifier extensions](extensibility.html#modifierExtension).',
        alias: ['extensions', 'user content'],
        min: 0,
        max: '*',
        base: {
          path: 'DomainResource.modifierExtension',
          min: 0,
          max: '*',
        },
        type: [
          {
            code: 'Extension',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
          {
            key: 'ext-1',
            severity: 'error',
            human: 'Must have either extensions or value[x], not both',
            expression: 'extension.exists() != value.exists()',
            xpath: 'exists(f:extension)!=exists(f:*[starts-with(local-name(.), "value")])',
            source: 'http://hl7.org/fhir/StructureDefinition/Extension',
          },
        ],
        isModifier: true,
        isModifierReason:
          'Modifier extensions are expected to modify the meaning or interpretation of the resource that contains them',
        isSummary: false,
        mapping: [
          {
            identity: 'rim',
            map: 'N/A',
          },
        ],
      },
      {
        id: 'Patient.identifier',
        path: 'Patient.identifier',
        short: 'An identifier for this patient',
        definition: 'An identifier for this patient.',
        requirements: 'Patients are almost always assigned specific numerical identifiers.',
        min: 0,
        max: '*',
        base: {
          path: 'Patient.identifier',
          min: 0,
          max: '*',
        },
        type: [
          {
            code: 'Identifier',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: true,
        mapping: [
          {
            identity: 'w5',
            map: 'FiveWs.identifier',
          },
          {
            identity: 'v2',
            map: 'PID-3',
          },
          {
            identity: 'rim',
            map: 'id',
          },
          {
            identity: 'cda',
            map: '.id',
          },
        ],
      },
      {
        id: 'Patient.active',
        path: 'Patient.active',
        short: "Whether this patient's record is in active use",
        definition:
          "Whether this patient record is in active use. \nMany systems use this property to mark as non-current patients, such as those that have not been seen for a period of time based on an organization's business rules.\n\nIt is often used to filter patient lists to exclude inactive patients\n\nDeceased patients may also be marked as inactive for the same reasons, but may be active for some time after death.",
        comment:
          'If a record is inactive, and linked to an active record, then future patient/record updates should occur on the other patient.',
        requirements: 'Need to be able to mark a patient record as not to be used because it was created in error.',
        min: 0,
        max: '1',
        base: {
          path: 'Patient.active',
          min: 0,
          max: '1',
        },
        type: [
          {
            code: 'boolean',
          },
        ],
        meaningWhenMissing:
          'This resource is generally assumed to be active if no value is provided for the active element',
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: true,
        isModifierReason:
          'This element is labelled as a modifier because it is a status element that can indicate that a record should not be treated as valid',
        isSummary: true,
        mapping: [
          {
            identity: 'w5',
            map: 'FiveWs.status',
          },
          {
            identity: 'rim',
            map: 'statusCode',
          },
          {
            identity: 'cda',
            map: 'n/a',
          },
        ],
      },
      {
        id: 'Patient.name',
        path: 'Patient.name',
        short: 'A name associated with the patient',
        definition: 'A name associated with the individual.',
        comment:
          'A patient may have multiple names with different uses or applicable periods. For animals, the name is a "HumanName" in the sense that is assigned and used by humans and has the same patterns.',
        requirements:
          'Need to be able to track the patient by multiple names. Examples are your official name and a partner name.',
        min: 1,
        max: '*',
        base: {
          path: 'Patient.name',
          min: 0,
          max: '*',
        },
        type: [
          {
            code: 'HumanName',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: true,
        mapping: [
          {
            identity: 'v2',
            map: 'PID-5, PID-9',
          },
          {
            identity: 'rim',
            map: 'name',
          },
          {
            identity: 'cda',
            map: '.patient.name',
          },
        ],
      },
      {
        id: 'Patient.telecom',
        path: 'Patient.telecom',
        short: 'A contact detail for the individual',
        definition:
          'A contact detail (e.g. a telephone number or an email address) by which the individual may be contacted.',
        comment:
          "A Patient may have multiple ways to be contacted with different uses or applicable periods.  May need to have options for contacting the person urgently and also to help with identification. The address might not go directly to the individual, but may reach another party that is able to proxy for the patient (i.e. home phone, or pet owner's phone).",
        requirements: 'People have (primary) ways to contact them in some way such as phone, email.',
        min: 0,
        max: '*',
        base: {
          path: 'Patient.telecom',
          min: 0,
          max: '*',
        },
        type: [
          {
            code: 'ContactPoint',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: true,
        mapping: [
          {
            identity: 'v2',
            map: 'PID-13, PID-14, PID-40',
          },
          {
            identity: 'rim',
            map: 'telecom',
          },
          {
            identity: 'cda',
            map: '.telecom',
          },
        ],
      },
      {
        id: 'Patient.gender',
        path: 'Patient.gender',
        short: 'male | female | other | unknown',
        definition:
          'Administrative Gender - the gender that the patient is considered to have for administration and record keeping purposes.',
        comment:
          'The gender might not match the biological sex as determined by genetics or the individual\'s preferred identification. Note that for both humans and particularly animals, there are other legitimate possibilities than male and female, though the vast majority of systems and contexts only support male and female.  Systems providing decision support or enforcing business rules should ideally do this on the basis of Observations dealing with the specific sex or gender aspect of interest (anatomical, chromosomal, social, etc.)  However, because these observations are infrequently recorded, defaulting to the administrative gender is common practice.  Where such defaulting occurs, rule enforcement should allow for the variation between administrative and biological, chromosomal and other gender aspects.  For example, an alert about a hysterectomy on a male should be handled as a warning or overridable error, not a "hard" error.  See the Patient Gender and Sex section for additional information about communicating patient gender and sex.',
        requirements:
          'Needed for identification of the individual, in combination with (at least) name and birth date.',
        min: 0,
        max: '1',
        base: {
          path: 'Patient.gender',
          min: 0,
          max: '1',
        },
        type: [
          {
            code: 'code',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: true,
        binding: {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/elementdefinition-bindingName',
              valueString: 'AdministrativeGender',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/elementdefinition-isCommonBinding',
              valueBoolean: true,
            },
          ],
          strength: 'required',
          description: 'The gender of a person used for administrative purposes.',
          valueSet: 'http://hl7.org/fhir/ValueSet/administrative-gender|4.0.1',
        },
        mapping: [
          {
            identity: 'v2',
            map: 'PID-8',
          },
          {
            identity: 'rim',
            map: 'player[classCode=PSN|ANM and determinerCode=INSTANCE]/administrativeGender',
          },
          {
            identity: 'cda',
            map: '.patient.administrativeGenderCode',
          },
        ],
      },
      {
        id: 'Patient.birthDate',
        path: 'Patient.birthDate',
        short: 'The date of birth for the individual',
        definition: 'The date of birth for the individual.',
        comment:
          'At least an estimated year should be provided as a guess if the real DOB is unknown  There is a standard extension "patient-birthTime" available that should be used where Time is required (such as in maternity/infant care systems).',
        requirements: 'Age of the individual drives many clinical processes.',
        min: 0,
        max: '1',
        base: {
          path: 'Patient.birthDate',
          min: 0,
          max: '1',
        },
        type: [
          {
            code: 'date',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: true,
        mapping: [
          {
            identity: 'v2',
            map: 'PID-7',
          },
          {
            identity: 'rim',
            map: 'player[classCode=PSN|ANM and determinerCode=INSTANCE]/birthTime',
          },
          {
            identity: 'cda',
            map: '.patient.birthTime',
          },
          {
            identity: 'loinc',
            map: '21112-8',
          },
        ],
      },
      {
        id: 'Patient.deceased[x]',
        path: 'Patient.deceased[x]',
        short: 'Indicates if the individual is deceased or not',
        definition: 'Indicates if the individual is deceased or not.',
        comment:
          "If there's no value in the instance, it means there is no statement on whether or not the individual is deceased. Most systems will interpret the absence of a value as a sign of the person being alive.",
        requirements:
          'The fact that a patient is deceased influences the clinical process. Also, in human communication and relation management it is necessary to know whether the person is alive.',
        min: 0,
        max: '1',
        base: {
          path: 'Patient.deceased[x]',
          min: 0,
          max: '1',
        },
        type: [
          {
            code: 'boolean',
          },
          {
            code: 'dateTime',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: true,
        isModifierReason:
          'This element is labeled as a modifier because once a patient is marked as deceased, the actions that are appropriate to perform on the patient may be significantly different.',
        isSummary: true,
        mapping: [
          {
            identity: 'v2',
            map: 'PID-30  (bool) and PID-29 (datetime)',
          },
          {
            identity: 'rim',
            map: 'player[classCode=PSN|ANM and determinerCode=INSTANCE]/deceasedInd, player[classCode=PSN|ANM and determinerCode=INSTANCE]/deceasedTime',
          },
          {
            identity: 'cda',
            map: 'n/a',
          },
        ],
      },
      {
        id: 'Patient.address',
        path: 'Patient.address',
        short: 'An address for the individual',
        definition: 'An address for the individual.',
        comment: 'Patient may have multiple addresses with different uses or applicable periods.',
        requirements:
          'May need to keep track of patient addresses for contacting, billing or reporting requirements and also to help with identification.',
        min: 0,
        max: '*',
        base: {
          path: 'Patient.address',
          min: 0,
          max: '*',
        },
        type: [
          {
            code: 'Address',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: true,
        mapping: [
          {
            identity: 'v2',
            map: 'PID-11',
          },
          {
            identity: 'rim',
            map: 'addr',
          },
          {
            identity: 'cda',
            map: '.addr',
          },
        ],
      },
      {
        id: 'Patient.maritalStatus',
        path: 'Patient.maritalStatus',
        short: 'Marital (civil) status of a patient',
        definition: "This field contains a patient's most recent marital (civil) status.",
        requirements: 'Most, if not all systems capture it.',
        min: 0,
        max: '0',
        base: {
          path: 'Patient.maritalStatus',
          min: 0,
          max: '1',
        },
        type: [
          {
            code: 'CodeableConcept',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: false,
        binding: {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/elementdefinition-bindingName',
              valueString: 'MaritalStatus',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/elementdefinition-isCommonBinding',
              valueBoolean: true,
            },
          ],
          strength: 'extensible',
          description: 'The domestic partnership status of a person.',
          valueSet: 'http://hl7.org/fhir/ValueSet/marital-status',
        },
        mapping: [
          {
            identity: 'v2',
            map: 'PID-16',
          },
          {
            identity: 'rim',
            map: 'player[classCode=PSN]/maritalStatusCode',
          },
          {
            identity: 'cda',
            map: '.patient.maritalStatusCode',
          },
        ],
      },
      {
        id: 'Patient.multipleBirth[x]',
        path: 'Patient.multipleBirth[x]',
        short: 'Whether patient is part of a multiple birth',
        definition:
          'Indicates whether the patient is part of a multiple (boolean) or indicates the actual birth order (integer).',
        comment:
          'Where the valueInteger is provided, the number is the birth number in the sequence. E.g. The middle birth in triplets would be valueInteger=2 and the third born would have valueInteger=3 If a boolean value was provided for this triplets example, then all 3 patient records would have valueBoolean=true (the ordering is not indicated).',
        requirements:
          "For disambiguation of multiple-birth children, especially relevant where the care provider doesn't meet the patient, such as labs.",
        min: 0,
        max: '1',
        base: {
          path: 'Patient.multipleBirth[x]',
          min: 0,
          max: '1',
        },
        type: [
          {
            code: 'boolean',
          },
          {
            code: 'integer',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: false,
        mapping: [
          {
            identity: 'v2',
            map: 'PID-24 (bool), PID-25 (integer)',
          },
          {
            identity: 'rim',
            map: 'player[classCode=PSN|ANM and determinerCode=INSTANCE]/multipleBirthInd,  player[classCode=PSN|ANM and determinerCode=INSTANCE]/multipleBirthOrderNumber',
          },
          {
            identity: 'cda',
            map: 'n/a',
          },
        ],
      },
      {
        id: 'Patient.photo',
        path: 'Patient.photo',
        short: 'Image of the patient',
        definition: 'Image of the patient.',
        comment:
          'Guidelines:\n* Use id photos, not clinical photos.\n* Limit dimensions to thumbnail.\n* Keep byte count low to ease resource updates.',
        requirements:
          'Many EHR systems have the capability to capture an image of the patient. Fits with newer social media usage too.',
        min: 0,
        max: '*',
        base: {
          path: 'Patient.photo',
          min: 0,
          max: '*',
        },
        type: [
          {
            code: 'Attachment',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: false,
        mapping: [
          {
            identity: 'v2',
            map: 'OBX-5 - needs a profile',
          },
          {
            identity: 'rim',
            map: 'player[classCode=PSN|ANM and determinerCode=INSTANCE]/desc',
          },
          {
            identity: 'cda',
            map: 'n/a',
          },
        ],
      },
      {
        id: 'Patient.contact',
        extension: [
          {
            url: 'http://hl7.org/fhir/StructureDefinition/structuredefinition-explicit-type-name',
            valueString: 'Contact',
          },
        ],
        path: 'Patient.contact',
        short: 'A contact party (e.g. guardian, partner, friend) for the patient',
        definition: 'A contact party (e.g. guardian, partner, friend) for the patient.',
        comment:
          'Contact covers all kinds of contact parties: family members, business contacts, guardians, caregivers. Not applicable to register pedigree and family ties beyond use of having contact.',
        requirements: 'Need to track people you can contact about the patient.',
        min: 0,
        max: '*',
        base: {
          path: 'Patient.contact',
          min: 0,
          max: '*',
        },
        type: [
          {
            code: 'BackboneElement',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
          {
            key: 'pat-1',
            severity: 'error',
            human: "SHALL at least contain a contact's details or a reference to an organization",
            expression: 'name.exists() or telecom.exists() or address.exists() or organization.exists()',
            xpath: 'exists(f:name) or exists(f:telecom) or exists(f:address) or exists(f:organization)',
          },
        ],
        isModifier: false,
        isSummary: false,
        mapping: [
          {
            identity: 'rim',
            map: 'player[classCode=PSN|ANM and determinerCode=INSTANCE]/scopedRole[classCode=CON]',
          },
          {
            identity: 'cda',
            map: 'n/a',
          },
        ],
      },
      {
        id: 'Patient.contact.id',
        path: 'Patient.contact.id',
        representation: ['xmlAttr'],
        short: 'Unique id for inter-element referencing',
        definition:
          'Unique id for the element within a resource (for internal references). This may be any string value that does not contain spaces.',
        min: 0,
        max: '1',
        base: {
          path: 'Element.id',
          min: 0,
          max: '1',
        },
        type: [
          {
            code: 'http://hl7.org/fhirpath/System.String',
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/structuredefinition-fhir-type',
                valueUrl: 'string',
              },
            ],
          },
        ],
        isModifier: false,
        isSummary: false,
        mapping: [
          {
            identity: 'rim',
            map: 'n/a',
          },
        ],
      },
      {
        id: 'Patient.contact.extension',
        path: 'Patient.contact.extension',
        short: 'Additional content defined by implementations',
        definition:
          'May be used to represent additional information that is not part of the basic definition of the element. To make the use of extensions safe and manageable, there is a strict set of governance  applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension.',
        comment:
          'There can be no stigma associated with the use of extensions by any application, project, or standard - regardless of the institution or jurisdiction that uses or defines the extensions.  The use of extensions is what allows the FHIR specification to retain a core level of simplicity for everyone.',
        alias: ['extensions', 'user content'],
        min: 0,
        max: '*',
        base: {
          path: 'Element.extension',
          min: 0,
          max: '*',
        },
        type: [
          {
            code: 'Extension',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
          {
            key: 'ext-1',
            severity: 'error',
            human: 'Must have either extensions or value[x], not both',
            expression: 'extension.exists() != value.exists()',
            xpath: 'exists(f:extension)!=exists(f:*[starts-with(local-name(.), "value")])',
            source: 'http://hl7.org/fhir/StructureDefinition/Extension',
          },
        ],
        isModifier: false,
        isSummary: false,
        mapping: [
          {
            identity: 'rim',
            map: 'n/a',
          },
        ],
      },
      {
        id: 'Patient.contact.modifierExtension',
        path: 'Patient.contact.modifierExtension',
        short: 'Extensions that cannot be ignored even if unrecognized',
        definition:
          "May be used to represent additional information that is not part of the basic definition of the element and that modifies the understanding of the element in which it is contained and/or the understanding of the containing element's descendants. Usually modifier elements provide negation or qualification. To make the use of extensions safe and manageable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions.\n\nModifier extensions SHALL NOT change the meaning of any elements on Resource or DomainResource (including cannot change the meaning of modifierExtension itself).",
        comment:
          'There can be no stigma associated with the use of extensions by any application, project, or standard - regardless of the institution or jurisdiction that uses or defines the extensions.  The use of extensions is what allows the FHIR specification to retain a core level of simplicity for everyone.',
        requirements:
          'Modifier extensions allow for extensions that *cannot* be safely ignored to be clearly distinguished from the vast majority of extensions which can be safely ignored.  This promotes interoperability by eliminating the need for implementers to prohibit the presence of extensions. For further information, see the [definition of modifier extensions](extensibility.html#modifierExtension).',
        alias: ['extensions', 'user content', 'modifiers'],
        min: 0,
        max: '*',
        base: {
          path: 'BackboneElement.modifierExtension',
          min: 0,
          max: '*',
        },
        type: [
          {
            code: 'Extension',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
          {
            key: 'ext-1',
            severity: 'error',
            human: 'Must have either extensions or value[x], not both',
            expression: 'extension.exists() != value.exists()',
            xpath: 'exists(f:extension)!=exists(f:*[starts-with(local-name(.), "value")])',
            source: 'http://hl7.org/fhir/StructureDefinition/Extension',
          },
        ],
        isModifier: true,
        isModifierReason:
          'Modifier extensions are expected to modify the meaning or interpretation of the element that contains them',
        isSummary: true,
        mapping: [
          {
            identity: 'rim',
            map: 'N/A',
          },
        ],
      },
      {
        id: 'Patient.contact.relationship',
        path: 'Patient.contact.relationship',
        short: 'The kind of relationship',
        definition: 'The nature of the relationship between the patient and the contact person.',
        requirements:
          'Used to determine which contact person is the most relevant to approach, depending on circumstances.',
        min: 0,
        max: '*',
        base: {
          path: 'Patient.contact.relationship',
          min: 0,
          max: '*',
        },
        type: [
          {
            code: 'CodeableConcept',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: false,
        binding: {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/elementdefinition-bindingName',
              valueString: 'ContactRelationship',
            },
          ],
          strength: 'extensible',
          description: 'The nature of the relationship between a patient and a contact person for that patient.',
          valueSet: 'http://hl7.org/fhir/ValueSet/patient-contactrelationship',
        },
        mapping: [
          {
            identity: 'v2',
            map: 'NK1-7, NK1-3',
          },
          {
            identity: 'rim',
            map: 'code',
          },
          {
            identity: 'cda',
            map: 'n/a',
          },
        ],
      },
      {
        id: 'Patient.contact.name',
        path: 'Patient.contact.name',
        short: 'A name associated with the contact person',
        definition: 'A name associated with the contact person.',
        requirements:
          'Contact persons need to be identified by name, but it is uncommon to need details about multiple other names for that contact person.',
        min: 0,
        max: '1',
        base: {
          path: 'Patient.contact.name',
          min: 0,
          max: '1',
        },
        type: [
          {
            code: 'HumanName',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: false,
        mapping: [
          {
            identity: 'v2',
            map: 'NK1-2',
          },
          {
            identity: 'rim',
            map: 'name',
          },
          {
            identity: 'cda',
            map: 'n/a',
          },
        ],
      },
      {
        id: 'Patient.contact.telecom',
        path: 'Patient.contact.telecom',
        short: 'A contact detail for the person',
        definition: 'A contact detail for the person, e.g. a telephone number or an email address.',
        comment:
          'Contact may have multiple ways to be contacted with different uses or applicable periods.  May need to have options for contacting the person urgently, and also to help with identification.',
        requirements: 'People have (primary) ways to contact them in some way such as phone, email.',
        min: 0,
        max: '*',
        base: {
          path: 'Patient.contact.telecom',
          min: 0,
          max: '*',
        },
        type: [
          {
            code: 'ContactPoint',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: false,
        mapping: [
          {
            identity: 'v2',
            map: 'NK1-5, NK1-6, NK1-40',
          },
          {
            identity: 'rim',
            map: 'telecom',
          },
          {
            identity: 'cda',
            map: 'n/a',
          },
        ],
      },
      {
        id: 'Patient.contact.address',
        path: 'Patient.contact.address',
        short: 'Address for the contact person',
        definition: 'Address for the contact person.',
        requirements: 'Need to keep track where the contact person can be contacted per postal mail or visited.',
        min: 0,
        max: '1',
        base: {
          path: 'Patient.contact.address',
          min: 0,
          max: '1',
        },
        type: [
          {
            code: 'Address',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: false,
        mapping: [
          {
            identity: 'v2',
            map: 'NK1-4',
          },
          {
            identity: 'rim',
            map: 'addr',
          },
          {
            identity: 'cda',
            map: 'n/a',
          },
        ],
      },
      {
        id: 'Patient.contact.gender',
        path: 'Patient.contact.gender',
        short: 'male | female | other | unknown',
        definition:
          'Administrative Gender - the gender that the contact person is considered to have for administration and record keeping purposes.',
        requirements: 'Needed to address the person correctly.',
        min: 0,
        max: '1',
        base: {
          path: 'Patient.contact.gender',
          min: 0,
          max: '1',
        },
        type: [
          {
            code: 'code',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: false,
        binding: {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/elementdefinition-bindingName',
              valueString: 'AdministrativeGender',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/elementdefinition-isCommonBinding',
              valueBoolean: true,
            },
          ],
          strength: 'required',
          description: 'The gender of a person used for administrative purposes.',
          valueSet: 'http://hl7.org/fhir/ValueSet/administrative-gender|4.0.1',
        },
        mapping: [
          {
            identity: 'v2',
            map: 'NK1-15',
          },
          {
            identity: 'rim',
            map: 'player[classCode=PSN|ANM and determinerCode=INSTANCE]/administrativeGender',
          },
          {
            identity: 'cda',
            map: 'n/a',
          },
        ],
      },
      {
        id: 'Patient.contact.organization',
        path: 'Patient.contact.organization',
        short: 'Organization that is associated with the contact',
        definition: 'Organization on behalf of which the contact is acting or for which the contact is working.',
        requirements: 'For guardians or business related contacts, the organization is relevant.',
        min: 0,
        max: '1',
        base: {
          path: 'Patient.contact.organization',
          min: 0,
          max: '1',
        },
        type: [
          {
            code: 'Reference',
            targetProfile: ['http://hl7.org/fhir/StructureDefinition/Organization'],
          },
        ],
        condition: ['pat-1'],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: false,
        mapping: [
          {
            identity: 'v2',
            map: 'NK1-13, NK1-30, NK1-31, NK1-32, NK1-41',
          },
          {
            identity: 'rim',
            map: 'scoper',
          },
          {
            identity: 'cda',
            map: 'n/a',
          },
        ],
      },
      {
        id: 'Patient.contact.period',
        path: 'Patient.contact.period',
        short:
          'The period during which this contact person or organization is valid to be contacted relating to this patient',
        definition:
          'The period during which this contact person or organization is valid to be contacted relating to this patient.',
        min: 0,
        max: '1',
        base: {
          path: 'Patient.contact.period',
          min: 0,
          max: '1',
        },
        type: [
          {
            code: 'Period',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: false,
        mapping: [
          {
            identity: 'rim',
            map: 'effectiveTime',
          },
          {
            identity: 'cda',
            map: 'n/a',
          },
        ],
      },
      {
        id: 'Patient.communication',
        path: 'Patient.communication',
        short: 'A language which may be used to communicate with the patient about his or her health',
        definition: 'A language which may be used to communicate with the patient about his or her health.',
        comment:
          'If no language is specified, this *implies* that the default local language is spoken.  If you need to convey proficiency for multiple modes, then you need multiple Patient.Communication associations.   For animals, language is not a relevant field, and should be absent from the instance. If the Patient does not speak the default local language, then the Interpreter Required Standard can be used to explicitly declare that an interpreter is required.',
        requirements:
          'If a patient does not speak the local language, interpreters may be required, so languages spoken and proficiency are important things to keep track of both for patient and other persons of interest.',
        min: 0,
        max: '0',
        base: {
          path: 'Patient.communication',
          min: 0,
          max: '*',
        },
        type: [
          {
            code: 'BackboneElement',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: false,
        mapping: [
          {
            identity: 'rim',
            map: 'LanguageCommunication',
          },
          {
            identity: 'cda',
            map: 'patient.languageCommunication',
          },
        ],
      },
      {
        id: 'Patient.communication.id',
        path: 'Patient.communication.id',
        representation: ['xmlAttr'],
        short: 'Unique id for inter-element referencing',
        definition:
          'Unique id for the element within a resource (for internal references). This may be any string value that does not contain spaces.',
        min: 0,
        max: '1',
        base: {
          path: 'Element.id',
          min: 0,
          max: '1',
        },
        type: [
          {
            code: 'http://hl7.org/fhirpath/System.String',
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/structuredefinition-fhir-type',
                valueUrl: 'string',
              },
            ],
          },
        ],
        isModifier: false,
        isSummary: false,
        mapping: [
          {
            identity: 'rim',
            map: 'n/a',
          },
        ],
      },
      {
        id: 'Patient.communication.extension',
        path: 'Patient.communication.extension',
        short: 'Additional content defined by implementations',
        definition:
          'May be used to represent additional information that is not part of the basic definition of the element. To make the use of extensions safe and manageable, there is a strict set of governance  applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension.',
        comment:
          'There can be no stigma associated with the use of extensions by any application, project, or standard - regardless of the institution or jurisdiction that uses or defines the extensions.  The use of extensions is what allows the FHIR specification to retain a core level of simplicity for everyone.',
        alias: ['extensions', 'user content'],
        min: 0,
        max: '*',
        base: {
          path: 'Element.extension',
          min: 0,
          max: '*',
        },
        type: [
          {
            code: 'Extension',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
          {
            key: 'ext-1',
            severity: 'error',
            human: 'Must have either extensions or value[x], not both',
            expression: 'extension.exists() != value.exists()',
            xpath: 'exists(f:extension)!=exists(f:*[starts-with(local-name(.), "value")])',
            source: 'http://hl7.org/fhir/StructureDefinition/Extension',
          },
        ],
        isModifier: false,
        isSummary: false,
        mapping: [
          {
            identity: 'rim',
            map: 'n/a',
          },
        ],
      },
      {
        id: 'Patient.communication.modifierExtension',
        path: 'Patient.communication.modifierExtension',
        short: 'Extensions that cannot be ignored even if unrecognized',
        definition:
          "May be used to represent additional information that is not part of the basic definition of the element and that modifies the understanding of the element in which it is contained and/or the understanding of the containing element's descendants. Usually modifier elements provide negation or qualification. To make the use of extensions safe and manageable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions.\n\nModifier extensions SHALL NOT change the meaning of any elements on Resource or DomainResource (including cannot change the meaning of modifierExtension itself).",
        comment:
          'There can be no stigma associated with the use of extensions by any application, project, or standard - regardless of the institution or jurisdiction that uses or defines the extensions.  The use of extensions is what allows the FHIR specification to retain a core level of simplicity for everyone.',
        requirements:
          'Modifier extensions allow for extensions that *cannot* be safely ignored to be clearly distinguished from the vast majority of extensions which can be safely ignored.  This promotes interoperability by eliminating the need for implementers to prohibit the presence of extensions. For further information, see the [definition of modifier extensions](extensibility.html#modifierExtension).',
        alias: ['extensions', 'user content', 'modifiers'],
        min: 0,
        max: '*',
        base: {
          path: 'BackboneElement.modifierExtension',
          min: 0,
          max: '*',
        },
        type: [
          {
            code: 'Extension',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
          {
            key: 'ext-1',
            severity: 'error',
            human: 'Must have either extensions or value[x], not both',
            expression: 'extension.exists() != value.exists()',
            xpath: 'exists(f:extension)!=exists(f:*[starts-with(local-name(.), "value")])',
            source: 'http://hl7.org/fhir/StructureDefinition/Extension',
          },
        ],
        isModifier: true,
        isModifierReason:
          'Modifier extensions are expected to modify the meaning or interpretation of the element that contains them',
        isSummary: true,
        mapping: [
          {
            identity: 'rim',
            map: 'N/A',
          },
        ],
      },
      {
        id: 'Patient.communication.language',
        path: 'Patient.communication.language',
        short: 'The language which can be used to communicate with the patient about his or her health',
        definition:
          'The ISO-639-1 alpha 2 code in lower case for the language, optionally followed by a hyphen and the ISO-3166-1 alpha 2 code for the region in upper case; e.g. "en" for English, or "en-US" for American English versus "en-EN" for England English.',
        comment:
          'The structure aa-BB with this exact casing is one the most widely used notations for locale. However not all systems actually code this but instead have it as free text. Hence CodeableConcept instead of code as the data type.',
        requirements:
          'Most systems in multilingual countries will want to convey language. Not all systems actually need the regional dialect.',
        min: 1,
        max: '1',
        base: {
          path: 'Patient.communication.language',
          min: 1,
          max: '1',
        },
        type: [
          {
            code: 'CodeableConcept',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: false,
        binding: {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/elementdefinition-maxValueSet',
              valueCanonical: 'http://hl7.org/fhir/ValueSet/all-languages',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/elementdefinition-bindingName',
              valueString: 'Language',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/elementdefinition-isCommonBinding',
              valueBoolean: true,
            },
          ],
          strength: 'preferred',
          description: 'A human language.',
          valueSet: 'http://hl7.org/fhir/ValueSet/languages',
        },
        mapping: [
          {
            identity: 'v2',
            map: 'PID-15, LAN-2',
          },
          {
            identity: 'rim',
            map: 'player[classCode=PSN|ANM and determinerCode=INSTANCE]/languageCommunication/code',
          },
          {
            identity: 'cda',
            map: '.languageCode',
          },
        ],
      },
      {
        id: 'Patient.communication.preferred',
        path: 'Patient.communication.preferred',
        short: 'Language preference indicator',
        definition:
          'Indicates whether or not the patient prefers this language (over other languages he masters up a certain level).',
        comment: 'This language is specifically identified for communicating healthcare information.',
        requirements:
          'People that master multiple languages up to certain level may prefer one or more, i.e. feel more confident in communicating in a particular language making other languages sort of a fall back method.',
        min: 0,
        max: '1',
        base: {
          path: 'Patient.communication.preferred',
          min: 0,
          max: '1',
        },
        type: [
          {
            code: 'boolean',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: false,
        mapping: [
          {
            identity: 'v2',
            map: 'PID-15',
          },
          {
            identity: 'rim',
            map: 'preferenceInd',
          },
          {
            identity: 'cda',
            map: '.preferenceInd',
          },
        ],
      },
      {
        id: 'Patient.generalPractitioner',
        path: 'Patient.generalPractitioner',
        short: "Patient's nominated primary care provider",
        definition: "Patient's nominated care provider.",
        comment:
          'This may be the primary care provider (in a GP context), or it may be a patient nominated care manager in a community/disability setting, or even organization that will provide people to perform the care provider roles.  It is not to be used to record Care Teams, these should be in a CareTeam resource that may be linked to the CarePlan or EpisodeOfCare resources.\nMultiple GPs may be recorded against the patient for various reasons, such as a student that has his home GP listed along with the GP at university during the school semesters, or a "fly-in/fly-out" worker that has the onsite GP also included with his home GP to remain aware of medical issues.\n\nJurisdictions may decide that they can profile this down to 1 if desired, or 1 per type.',
        alias: ['careProvider'],
        min: 0,
        max: '*',
        base: {
          path: 'Patient.generalPractitioner',
          min: 0,
          max: '*',
        },
        type: [
          {
            code: 'Reference',
            targetProfile: [
              'http://hl7.org/fhir/StructureDefinition/Organization',
              'http://hl7.org/fhir/StructureDefinition/Practitioner',
              'http://hl7.org/fhir/StructureDefinition/PractitionerRole',
            ],
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: false,
        mapping: [
          {
            identity: 'v2',
            map: 'PD1-4',
          },
          {
            identity: 'rim',
            map: 'subjectOf.CareEvent.performer.AssignedEntity',
          },
          {
            identity: 'cda',
            map: 'n/a',
          },
        ],
      },
      {
        id: 'Patient.managingOrganization',
        path: 'Patient.managingOrganization',
        short: 'Organization that is the custodian of the patient record',
        definition: 'Organization that is the custodian of the patient record.',
        comment:
          'There is only one managing organization for a specific patient record. Other organizations will have their own Patient record, and may use the Link property to join the records together (or a Person resource which can include confidence ratings for the association).',
        requirements: 'Need to know who recognizes this patient record, manages and updates it.',
        min: 0,
        max: '1',
        base: {
          path: 'Patient.managingOrganization',
          min: 0,
          max: '1',
        },
        type: [
          {
            code: 'Reference',
            targetProfile: ['http://hl7.org/fhir/StructureDefinition/Organization'],
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: true,
        mapping: [
          {
            identity: 'rim',
            map: 'scoper',
          },
          {
            identity: 'cda',
            map: '.providerOrganization',
          },
        ],
      },
      {
        id: 'Patient.link',
        path: 'Patient.link',
        short: 'Link to another patient resource that concerns the same actual person',
        definition: 'Link to another patient resource that concerns the same actual patient.',
        comment: 'There is no assumption that linked patient records have mutual links.',
        requirements:
          'There are multiple use cases:   \n\n* Duplicate patient records due to the clerical errors associated with the difficulties of identifying humans consistently, and \n* Distribution of patient information across multiple servers.',
        min: 0,
        max: '*',
        base: {
          path: 'Patient.link',
          min: 0,
          max: '*',
        },
        type: [
          {
            code: 'BackboneElement',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: true,
        isModifierReason:
          "This element is labeled as a modifier because it might not be the main Patient resource, and the referenced patient should be used instead of this Patient record. This is when the link.type value is 'replaced-by'",
        isSummary: true,
        mapping: [
          {
            identity: 'rim',
            map: 'outboundLink',
          },
          {
            identity: 'cda',
            map: 'n/a',
          },
        ],
      },
      {
        id: 'Patient.link.id',
        path: 'Patient.link.id',
        representation: ['xmlAttr'],
        short: 'Unique id for inter-element referencing',
        definition:
          'Unique id for the element within a resource (for internal references). This may be any string value that does not contain spaces.',
        min: 0,
        max: '1',
        base: {
          path: 'Element.id',
          min: 0,
          max: '1',
        },
        type: [
          {
            code: 'http://hl7.org/fhirpath/System.String',
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/structuredefinition-fhir-type',
                valueUrl: 'string',
              },
            ],
          },
        ],
        isModifier: false,
        isSummary: false,
        mapping: [
          {
            identity: 'rim',
            map: 'n/a',
          },
        ],
      },
      {
        id: 'Patient.link.extension',
        path: 'Patient.link.extension',
        short: 'Additional content defined by implementations',
        definition:
          'May be used to represent additional information that is not part of the basic definition of the element. To make the use of extensions safe and manageable, there is a strict set of governance  applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension.',
        comment:
          'There can be no stigma associated with the use of extensions by any application, project, or standard - regardless of the institution or jurisdiction that uses or defines the extensions.  The use of extensions is what allows the FHIR specification to retain a core level of simplicity for everyone.',
        alias: ['extensions', 'user content'],
        min: 0,
        max: '*',
        base: {
          path: 'Element.extension',
          min: 0,
          max: '*',
        },
        type: [
          {
            code: 'Extension',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
          {
            key: 'ext-1',
            severity: 'error',
            human: 'Must have either extensions or value[x], not both',
            expression: 'extension.exists() != value.exists()',
            xpath: 'exists(f:extension)!=exists(f:*[starts-with(local-name(.), "value")])',
            source: 'http://hl7.org/fhir/StructureDefinition/Extension',
          },
        ],
        isModifier: false,
        isSummary: false,
        mapping: [
          {
            identity: 'rim',
            map: 'n/a',
          },
        ],
      },
      {
        id: 'Patient.link.modifierExtension',
        path: 'Patient.link.modifierExtension',
        short: 'Extensions that cannot be ignored even if unrecognized',
        definition:
          "May be used to represent additional information that is not part of the basic definition of the element and that modifies the understanding of the element in which it is contained and/or the understanding of the containing element's descendants. Usually modifier elements provide negation or qualification. To make the use of extensions safe and manageable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions.\n\nModifier extensions SHALL NOT change the meaning of any elements on Resource or DomainResource (including cannot change the meaning of modifierExtension itself).",
        comment:
          'There can be no stigma associated with the use of extensions by any application, project, or standard - regardless of the institution or jurisdiction that uses or defines the extensions.  The use of extensions is what allows the FHIR specification to retain a core level of simplicity for everyone.',
        requirements:
          'Modifier extensions allow for extensions that *cannot* be safely ignored to be clearly distinguished from the vast majority of extensions which can be safely ignored.  This promotes interoperability by eliminating the need for implementers to prohibit the presence of extensions. For further information, see the [definition of modifier extensions](extensibility.html#modifierExtension).',
        alias: ['extensions', 'user content', 'modifiers'],
        min: 0,
        max: '*',
        base: {
          path: 'BackboneElement.modifierExtension',
          min: 0,
          max: '*',
        },
        type: [
          {
            code: 'Extension',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
          {
            key: 'ext-1',
            severity: 'error',
            human: 'Must have either extensions or value[x], not both',
            expression: 'extension.exists() != value.exists()',
            xpath: 'exists(f:extension)!=exists(f:*[starts-with(local-name(.), "value")])',
            source: 'http://hl7.org/fhir/StructureDefinition/Extension',
          },
        ],
        isModifier: true,
        isModifierReason:
          'Modifier extensions are expected to modify the meaning or interpretation of the element that contains them',
        isSummary: true,
        mapping: [
          {
            identity: 'rim',
            map: 'N/A',
          },
        ],
      },
      {
        id: 'Patient.link.other',
        path: 'Patient.link.other',
        short: 'The other patient or related person resource that the link refers to',
        definition: 'The other patient resource that the link refers to.',
        comment:
          'Referencing a RelatedPerson here removes the need to use a Person record to associate a Patient and RelatedPerson as the same individual.',
        min: 1,
        max: '1',
        base: {
          path: 'Patient.link.other',
          min: 1,
          max: '1',
        },
        type: [
          {
            code: 'Reference',
            targetProfile: [
              'http://hl7.org/fhir/StructureDefinition/Patient',
              'http://hl7.org/fhir/StructureDefinition/RelatedPerson',
            ],
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/structuredefinition-hierarchy',
                valueBoolean: false,
              },
            ],
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: true,
        mapping: [
          {
            identity: 'v2',
            map: 'PID-3, MRG-1',
          },
          {
            identity: 'rim',
            map: 'id',
          },
          {
            identity: 'cda',
            map: 'n/a',
          },
        ],
      },
      {
        id: 'Patient.link.type',
        path: 'Patient.link.type',
        short: 'replaced-by | replaces | refer | seealso',
        definition: 'The type of link between this patient resource and another patient resource.',
        min: 1,
        max: '1',
        base: {
          path: 'Patient.link.type',
          min: 1,
          max: '1',
        },
        type: [
          {
            code: 'code',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: true,
        binding: {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/elementdefinition-bindingName',
              valueString: 'LinkType',
            },
          ],
          strength: 'required',
          description: 'The type of link between this patient resource and another patient resource.',
          valueSet: 'http://hl7.org/fhir/ValueSet/link-type|4.0.1',
        },
        mapping: [
          {
            identity: 'rim',
            map: 'typeCode',
          },
          {
            identity: 'cda',
            map: 'n/a',
          },
        ],
      },
    ],
  },
  differential: {
    element: [
      {
        id: 'Patient.extension',
        path: 'Patient.extension',
        slicing: {
          discriminator: [
            {
              type: 'value',
              path: 'url',
            },
          ],
          ordered: false,
          rules: 'open',
        },
      },
      {
        id: 'Patient.extension:species',
        path: 'Patient.extension',
        sliceName: 'species',
        definition: 'The species of the fish.',
        min: 0,
        max: '1',
        type: [
          {
            code: 'Extension',
            profile: ['http://example.org/fhir/fish/StructureDefinition/fish-species'],
          },
        ],
      },
      {
        id: 'Patient.name',
        path: 'Patient.name',
        min: 1,
      },
      {
        id: 'Patient.maritalStatus',
        path: 'Patient.maritalStatus',
        max: '0',
      },
      {
        id: 'Patient.communication',
        path: 'Patient.communication',
        max: '0',
      },
    ],
  },
};

const FISH_SPECIES_EXTENSION_SD: ProfileStructureDefinition = {
  resourceType: 'StructureDefinition',
  id: 'fish-species',
  url: 'http://example.org/fhir/fish/StructureDefinition/fish-species',
  name: 'FishSpecies',
  title: 'Fish Species',
  status: 'draft',
  description: 'The species of the fish.',
  fhirVersion: '4.0.1',
  mapping: [
    {
      identity: 'rim',
      uri: 'http://hl7.org/v3',
      name: 'RIM Mapping',
    },
  ],
  kind: 'complex-type',
  abstract: false,
  context: [
    {
      type: 'element',
      expression: 'Element',
    },
  ],
  type: 'Extension',
  baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Extension',
  derivation: 'constraint',
  snapshot: {
    element: [
      {
        id: 'Extension',
        path: 'Extension',
        short: 'Fish Species',
        definition: 'The species of the fish.',
        min: 0,
        max: '*',
        base: {
          path: 'Extension',
          min: 0,
          max: '*',
        },
        condition: ['ele-1'],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
          {
            key: 'ext-1',
            severity: 'error',
            human: 'Must have either extensions or value[x], not both',
            expression: 'extension.exists() != value.exists()',
            xpath: "exists(f:extension)!=exists(f:*[starts-with(local-name(.), 'value')])",
          },
        ],
        isModifier: false,
        mapping: [
          {
            identity: 'rim',
            map: 'n/a',
          },
          {
            identity: 'rim',
            map: 'N/A',
          },
        ],
      },
      {
        id: 'Extension.id',
        path: 'Extension.id',
        representation: ['xmlAttr'],
        short: 'Unique id for inter-element referencing',
        definition:
          'Unique id for the element within a resource (for internal references). This may be any string value that does not contain spaces.',
        min: 0,
        max: '1',
        base: {
          path: 'Element.id',
          min: 0,
          max: '1',
        },
        type: [
          {
            code: 'http://hl7.org/fhirpath/System.String',
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/structuredefinition-fhir-type',
                valueUrl: 'string',
              },
            ],
          },
        ],
        isModifier: false,
        isSummary: false,
        mapping: [
          {
            identity: 'rim',
            map: 'n/a',
          },
        ],
      },
      {
        id: 'Extension.extension',
        path: 'Extension.extension',
        slicing: {
          discriminator: [
            {
              type: 'value',
              path: 'url',
            },
          ],
          description: 'Extensions are always sliced by (at least) url',
          rules: 'open',
        },
        short: 'Additional content defined by implementations',
        definition:
          'May be used to represent additional information that is not part of the basic definition of the element. To make the use of extensions safe and manageable, there is a strict set of governance  applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension.',
        comment:
          'There can be no stigma associated with the use of extensions by any application, project, or standard - regardless of the institution or jurisdiction that uses or defines the extensions.  The use of extensions is what allows the FHIR specification to retain a core level of simplicity for everyone.',
        alias: ['extensions', 'user content'],
        min: 0,
        max: '0',
        base: {
          path: 'Element.extension',
          min: 0,
          max: '*',
        },
        type: [
          {
            code: 'Extension',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
          {
            key: 'ext-1',
            severity: 'error',
            human: 'Must have either extensions or value[x], not both',
            expression: 'extension.exists() != value.exists()',
            xpath: 'exists(f:extension)!=exists(f:*[starts-with(local-name(.), "value")])',
            source: 'http://hl7.org/fhir/StructureDefinition/Extension',
          },
        ],
        isModifier: false,
        isSummary: false,
        mapping: [
          {
            identity: 'rim',
            map: 'n/a',
          },
        ],
      },
      {
        id: 'Extension.url',
        path: 'Extension.url',
        representation: ['xmlAttr'],
        short: 'identifies the meaning of the extension',
        definition: 'Source of the definition for the extension code - a logical name or a URL.',
        comment:
          'The definition may point directly to a computable or human-readable definition of the extensibility codes, or it may be a logical URI as declared in some other specification. The definition SHALL be a URI for the Structure Definition defining the extension.',
        min: 1,
        max: '1',
        base: {
          path: 'Extension.url',
          min: 1,
          max: '1',
        },
        type: [
          {
            code: 'http://hl7.org/fhirpath/System.String',
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/structuredefinition-fhir-type',
                valueUrl: 'uri',
              },
            ],
          },
        ],
        fixedUri: 'http://example.org/fhir/fish/StructureDefinition/fish-species',
        isModifier: false,
        isSummary: false,
        mapping: [
          {
            identity: 'rim',
            map: 'N/A',
          },
        ],
      },
      {
        id: 'Extension.value[x]',
        path: 'Extension.value[x]',
        short: 'Value of extension',
        definition:
          'Value of extension - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list).',
        min: 0,
        max: '1',
        base: {
          path: 'Extension.value[x]',
          min: 0,
          max: '1',
        },
        type: [
          {
            code: 'CodeableConcept',
          },
        ],
        constraint: [
          {
            key: 'ele-1',
            severity: 'error',
            human: 'All FHIR elements must have a @value or children',
            expression: 'hasValue() or (children().count() > id.count())',
            xpath: '@value|f:*|h:div',
            source: 'http://hl7.org/fhir/StructureDefinition/Element',
          },
        ],
        isModifier: false,
        isSummary: false,
        binding: {
          strength: 'extensible',
          valueSet: 'http://example.org/fhir/fish/ValueSet/fish-species-value-set',
        },
        mapping: [
          {
            identity: 'rim',
            map: 'N/A',
          },
        ],
      },
    ],
  },
  differential: {
    element: [
      {
        id: 'Extension',
        path: 'Extension',
        short: 'Fish Species',
        definition: 'The species of the fish.',
      },
      {
        id: 'Extension.extension',
        path: 'Extension.extension',
        max: '0',
      },
      {
        id: 'Extension.url',
        path: 'Extension.url',
        fixedUri: 'http://example.org/fhir/fish/StructureDefinition/fish-species',
      },
      {
        id: 'Extension.value[x]',
        path: 'Extension.value[x]',
        type: [
          {
            code: 'CodeableConcept',
          },
        ],
        binding: {
          strength: 'extensible',
          valueSet: 'http://example.org/fhir/fish/ValueSet/fish-species-value-set',
        },
      },
    ],
  },
};

export const FishPatientResources = {
  getFishPatientProfileSD: () => deepClone(FISH_PATIENT_PROFILE_SD),
  getFishSpeciesExtensionSD: () => deepClone(FISH_SPECIES_EXTENSION_SD),
  getSampleFishPatient: () => deepClone(SAMPLE_FISH_PATIENT),
};
