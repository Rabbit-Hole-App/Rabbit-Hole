Workflow status: **ready**. Initial candidate was a synthetic fixture.

# Understanding Grouped Reports

## Module 1: Rows, fields, and categories

### What the table holds

- A row as one recorded transaction
- A field as one kind of value recorded on every row
- Category fields (repeated values) versus amount fields (numbers)

## Module 2: Producing a grouped report

### Choosing the category field

- Selecting the field whose values define the groups
- The distinct values of the chosen field become the report's rows
- Choosing a different field changes which groups appear

### Running the report

- Pressing Run to aggregate the already-provisioned table
- Grouping as collecting rows that share the chosen field's value
- No query writing required by the user in this app

## Module 3: Reading counts and sums

### What each result row reports

- A count as how many table rows fell into that group
- A sum as the total of an amount field across that group's rows
- Counting rows versus adding their amounts

### Limits of the reported numbers

- Totals describe the rows present in the supplied table, not events missing from it
- A count and a sum can move independently (many small rows versus few large ones)
- Groups depend on how the chosen field's values were recorded

## Scope for approval

Duration: **fits**. Twenty minutes supports a qualitative walk from table structure to field selection, running the report, and interpreting a result row. It does not cover query languages, data preparation, or statistical analysis of the totals.

- Prerequisite: Basic arithmetic

- Prerequisite: Reading a table of rows and columns

- Writing SQL or other queries is excluded: the app exposes field selection and a Run action, not typed queries.

- Data provisioning, loading, and the handling of blank or inconsistent field values are not documented in the supplied evidence.

- Aggregations beyond the documented counts and sums (averages, filters, multi-field grouping) are out of scope; the evidence describes only counts and sums by one selected category field.
