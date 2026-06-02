import { query, sparqlEscapeInt, sparqlEscapeString } from 'mu';
import { jsonToCsv, queryResultToJson } from '../util/json-to-csv';
import { paginationToQueryValue, sortToQueryValue } from '../util/query-param';
import { getTotalCountOfConceptualProcesses } from './count';

export interface ConceptualProcessTableFilters {
  sort?: string;
  page?: number;
  size?: number;
  categoryId?: string;
  domainId?: string;
  groupId?: string;
  title?: string;
  number?: string;
}
interface SparqlFilters {
  sort?: string;
  pagination?: string;
  category?: string;
  domain?: string;
  group?: string;
  title?: string;
  number?: string;
}

interface HeaderOption {
  sortProperty: string;
  field: string;
  label: string;
  order?: number;
}

export async function getConceptualProcessTableContent(
  filters: ConceptualProcessTableFilters,
  isProcessUriIncluded = false,
) {
  const meta = await getPaginationForContent(filters);
  const tableContent = await getTableContent(filters);
  const header: Array<HeaderOption> = [
    {
      sortProperty: 'process',
      field: 'id',
      label: 'Proces URI',
      order: isProcessUriIncluded ? 6 : undefined,
    },
    {
      sortProperty: 'id',
      field: 'id',
      label: 'id',
    },
    {
      sortProperty: 'categories',
      field: 'category',
      label: 'Categorie',
      order: 1,
    },
    {
      sortProperty: 'processDomains',
      field: 'domain',
      label: 'Procesdomein',
      order: 2,
    },
    {
      sortProperty: 'processGroups',
      field: 'group',
      label: 'Procesgroep',
      order: 3,
    },
    {
      sortProperty: 'title',
      field: 'title',
      label: 'Proces',
      order: 4,
    },
    {
      sortProperty: 'identifierNumber',
      field: 'number',
      label: 'Nummer',
      order: 5,
    },
  ];

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const content = Object.entries(tableContent).map(([key, process]) => {
    const visual = {};
    Object.entries(process).map(([key, value]) => {
      const label = header.find((h) => h.sortProperty === key)?.label;
      visual[label] = value;
    });
    return visual;
  });

  return {
    headerLabels: header
      .filter((h) => h.order)
      .sort((a, b) => a.order - b.order),
    content: content,
    meta,
  };
}

export async function getConceptualProcessExport(
  filters: ConceptualProcessTableFilters,
) {
  const tableContent = await getConceptualProcessTableContent(filters, true);
  const contentInOrder = tableContent.content.map((process) => {
    return Object.fromEntries(
      tableContent.headerLabels.map((header) => [
        header.label,
        process[header.label],
      ]),
    );
  });

  return await jsonToCsv(contentInOrder);
}

async function getTableContent(filters: ConceptualProcessTableFilters) {
  const sparqlFilters = getSparqlFiltersForFilters(filters);
  const queryResult = await query(`
    PREFIX oph: <http://lblod.data.gift/vocabularies/openproceshuis/>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT DISTINCT ?process ?id ?identifierNumber ?title
                    (GROUP_CONCAT(DISTINCT ?category; SEPARATOR=" / ") AS ?categories)
                    (GROUP_CONCAT(DISTINCT ?processDomain; SEPARATOR=" / ") AS ?processDomains)
                    (GROUP_CONCAT(DISTINCT ?processGroup; SEPARATOR=" / ") AS ?processGroups)
    WHERE {
      ?process a oph:ConceptueelProces .
      ?process mu:uuid ?id .

      ${sparqlFilters.group || ''}
      ${sparqlFilters.domain || ''}
      ${sparqlFilters.category || ''}
      ${sparqlFilters.number || ''}
      ${sparqlFilters.title || ''}

      OPTIONAl {
        ?process adms:status ?status .
      }
      BIND(IF(BOUND(?status), ?status,  <http://lblod.data.gift/concepts/concept-status/canShowInOPH>) as ?safeStatus) # magic url
      FILTER(?safeStatus != <http://lblod.data.gift/concepts/concept-status/gearchiveerd>)

      ?process dct:title ?title .
      ?process dct:identifier ?identifierNumber .

      ?process oph:procesGroep ?processGroupUri .
      ?processGroupUri skos:prefLabel ?processGroup .

      ?processGroupUri skos:relatedMatch ?processDomainUri .
      ?processDomainUri skos:prefLabel ?processDomain .

      ?processDomainUri skos:relatedMatch ?categoryUri .
      ?categoryUri skos:prefLabel ?category .
    }
    ${sparqlFilters.sort}
    ${sparqlFilters.pagination}
  `);

  return await queryResultToJson(queryResult);
}

export function getSparqlFiltersForFilters(
  filters: ConceptualProcessTableFilters,
): SparqlFilters {
  const sortVarModelPropertyMap = [
    { fieldName: 'number', var: 'identifierNumber' },
    { fieldName: 'category', var: 'categories', lowerCase: true },
    { fieldName: 'group', var: 'processGroups', lowerCase: true },
    { fieldName: 'domain', var: 'processDomains', lowerCase: true },
    { fieldName: 'title', var: 'title', lowerCase: true },
  ];
  const sparqlFilters = {
    sort: sortToQueryValue(filters.sort, sortVarModelPropertyMap),
    pagination: paginationToQueryValue(filters.page, filters.size),
  };

  if (filters.categoryId) {
    sparqlFilters['category'] = `
      ?categoryUri mu:uuid ${sparqlEscapeString(filters.categoryId)} .
    `;
  }
  if (filters.domainId) {
    sparqlFilters['domain'] = `
      ?processDomainUri mu:uuid ${sparqlEscapeString(filters.domainId)} .
    `;
  }
  if (filters.groupId) {
    sparqlFilters['group'] = `
      ?processGroupUri mu:uuid ${sparqlEscapeString(filters.groupId)} .
    `;
  }
  if (filters.number) {
    sparqlFilters['number'] = `
    VALUES ?identifierNumber { ${sparqlEscapeInt(filters.number)} }
      ?process dct:identifier ?identifierNumber .
    `;
  }
  if (filters.title) {
    sparqlFilters['title'] = `
      FILTER(CONTAINS(LCASE(?title), LCASE(${sparqlEscapeString(filters.title)})))
    `;
  }

  return sparqlFilters;
}

async function getPaginationForContent(filters: ConceptualProcessTableFilters) {
  const count = await getTotalCountOfConceptualProcesses(filters);
  const { page, size } = filters;
  const lastPage = Math.floor(count / size);
  const meta = {
    count,
    pagination: {
      first: {
        number: 0,
      },
      self: {
        number: page,
        size: size,
      },
      last: {
        number: lastPage,
      },
      prev: undefined,
      next: undefined,
    },
  };
  if (page && page > 0) {
    meta.pagination.prev = {
      number: page - 1,
      size: size,
    };
  }
  if (page === lastPage) {
    meta.pagination.self = {
      number: page,
      size: Math.abs(count - page * size),
    };
  }
  if (page * size < count) {
    meta.pagination.next = {
      number: page + 1,
      size: size,
    };
  }

  return meta;
}
