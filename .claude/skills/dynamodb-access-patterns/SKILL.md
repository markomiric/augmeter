---
name: dynamodb-access-patterns
description: Use when designing a DynamoDB table schema from entities and access patterns. Invoke for new tables, when adding a new access pattern that doesn't fit the existing keys, when evaluating whether to add a GSI, or when a query is turning into a Scan. Not for general NoSQL advice -- this is specifically DynamoDB single-table design.
---

# DynamoDB Access Patterns Designer

You help the user design a DynamoDB table schema that supports their required queries efficiently. DynamoDB is not a relational database: every query must be served by the primary key or a Global Secondary Index, and both must be designed up-front from the access patterns. A good design makes every required query a GetItem or a bounded Query; a bad design forces Scans that scale with table size.

## Process

1. **Collect the inputs.** Before suggesting anything, you must have:
   - The list of **entities** (User, Task, Order, etc.) with their attributes.
   - The list of **access patterns** (queries) the application needs, each phrased as "given X, find Y sorted by Z". If the user gives only entity shapes without queries, ask for the queries -- the schema is driven by queries, not by entities.
   - The expected **write patterns** (who creates what, with what frequency). This matters for hot-partition risk.
   - Any **cardinality constraints** (one user has ~10 conversations, or ~10 million events?). Affects whether a collection fits in a single item list, a query against a partition, or needs sharding.

2. **Classify each access pattern.** For every query, name the entity returned and the lookup attribute. Example: "list a user's conversations ordered by recent activity" -> entity=Conversation, partition=user, sort=updated_at.

3. **Propose a key schema.** Start with a single table using generic `PK` and `SK` attribute names (not `userId`, `conversationId`) -- this lets heterogeneous items share the table. For each entity, define the PK/SK format as a string template: e.g. `PK = USER#<userId>`, `SK = CONVMETA#<conversationId>`. Use the `#` separator convention. Prefix every key with the entity type so you can tell rows apart and scan by type if needed. (This repo follows this convention -- see "This repo's conventions" below for its exact templates.)

4. **Cover every access pattern.** Walk through each query and show which key (primary, GSI1, GSI2, ...) serves it. If a query cannot be served by the primary key, add a GSI with an overloaded key (e.g. `GSI1PK = USER#<userId>#STATUS#<status>`, `GSI1SK = <created_at_iso>`). Name GSIs numerically (GSI1, GSI2) -- never by the attribute they currently index, because GSIs get repurposed.

5. **Check for trouble.** Before finalizing, verify:
   - **No Scan-based queries.** If a query has no key that starts with its input attribute, the design is broken.
   - **No single hot key.** DynamoDB now has instant adaptive capacity and split-for-heat, so uneven traffic spread across _many_ partition-key values is rebalanced automatically -- you no longer over-provision for the hottest partition. What it cannot fix is a _single_ partition-key value that exceeds the per-partition ceiling of **3,000 RCU / 1,000 WCU**, or **monotonic keys** (auto-increment IDs, raw timestamps as the PK) that funnel every new write to one rolling hot spot. For those, shard the key with a suffix or move the value out to its own item. Don't pre-shard a key that isn't actually hot.
   - **GSI projections.** Default to `ALL` projection unless storage/write cost is a concern; only narrow to `KEYS_ONLY` or `INCLUDE` when you've measured cost.
   - **Item size.** DynamoDB items max out at 400 KB. If you're packing a collection into a single item (e.g. a user's list of tags), confirm the bound.
   - **Sparse indexes.** If only some items have the GSI key populated, the index is sparse and cheap -- note this as a feature, not a bug.
   - **Limits to remember:** item 400 KB; 20 GSIs per table (soft, raisable via support); 5 LSIs per table (hard); LSIs impose a 10 GB collection cap per partition-key value (and block split-for-heat) -- prefer GSIs; per-partition ceiling 3,000 RCU / 1,000 WCU.

6. **Produce deliverables.** Always output:
   - A **table schema** block (attribute definitions, key schema, GSIs) in the format the user's IaC tool uses. This repo uses Serverless Framework / CloudFormation (_serverless.yml_ with `resources/*.yml` includes), so default to CloudFormation YAML. Use Terraform if you see _.tf_ files, CDK if you see _.ts_/_.py_ CDK code, otherwise plain AWS CLI `create-table` JSON.
   - An **access pattern -> key** table: for each query, which key answers it and the boto3 call that executes it.
   - A **key format table** listing every entity with its PK, SK, and any GSI key templates.

## Heuristics

- **One table per bounded context, not per entity.** Joins are impossible; the table must hold every entity you want to query together.
- **Prefer Query over GetItem when you have an item collection.** Fetching a user's messages or child records with one partition query is the single-table superpower.
- **Sort keys encode hierarchy.** `SK = CONVMSG#<conversation_id>#<created_at>#<message_id>` lets you query one conversation's messages with `begins_with`.
- **Time-based sort keys use ISO-8601 strings.** They sort lexicographically in the right order and don't need numeric conversion. Use UTC.
- **Never put mutable values in a key.** If `status` is in a GSI key and you update it, you must delete-then-write the item (DynamoDB doesn't allow key updates). Design around this or accept the cost.
- **Pagination is per-partition.** `LastEvaluatedKey` is scoped to a query; if a partition has 50K items, paginate through it, don't expect a single call to return them all.
- **Composite GSI keys for multi-attribute filters.** To query "conversations for user U ordered by updated_at", encode `GS1PK = USER#U#CONV`, `GS1SK = <updated_at>`. Use overloaded keys -- a single GSI can serve many patterns by varying the template.
- **GSIs have eventual consistency.** Never rely on a GSI for read-your-writes; use the primary key for that.

## Common mistakes to flag

- Designing entity tables (one table per entity) then adding GSIs for every join -- this is the RDBMS habit. Push back and unify.
- Using `userId` / `conversationId` as PK/SK directly. This blocks the single-table pattern and makes overloading impossible.
- Putting a timestamp in the PK. Then every query needs the exact timestamp.
- Encoding a list as multiple items without a SK prefix. You lose the ability to query the collection efficiently.
- Adding a GSI for a query that runs once a day. Use an async export to S3 + Athena instead; GSIs cost storage and write capacity forever.
- Forgetting that `Scan` is paid per item scanned, not per item returned. A filtered scan on a million-item table scans a million items.

## Worked example: Multi-tenant ticket tracker

**Entities:** Tenant, User, Ticket, Comment.

**Access patterns:**

1. Get a user by id.
2. List all users in a tenant.
3. Get a ticket by id (the ticket knows its tenant).
4. List open tickets for a user, newest first.
5. List all tickets in a tenant with status X, newest first.
6. Get a ticket plus all its comments.

**Key format table:**

| Entity  | PK             | SK                                 | GSI1PK                       | GSI1SK         |
| ------- | -------------- | ---------------------------------- | ---------------------------- | -------------- |
| Tenant  | `TENANT#<tid>` | `TENANT#<tid>`                     | -                            | -              |
| User    | `TENANT#<tid>` | `USER#<uid>`                       | `USER#<uid>`                 | `USER#<uid>`   |
| Ticket  | `TENANT#<tid>` | `TICKET#<ticket_id>`               | `USER#<uid>#STATUS#<status>` | `<created_at>` |
| Comment | `TENANT#<tid>` | `TICKET#<ticket_id>#COMMENT#<cid>` | -                            | -              |

**Access pattern -> key:**

| #   | Query                                      | Key     | Operation                     | Condition                                                 |
| --- | ------------------------------------------ | ------- | ----------------------------- | --------------------------------------------------------- |
| 1   | User by id                                 | GSI1    | Query                         | `GSI1PK = USER#<uid>`                                     |
| 2   | All users in a tenant                      | Primary | Query                         | `PK = TENANT#<tid> AND SK begins_with USER#`              |
| 3   | Ticket by id (given tenant)                | Primary | GetItem                       | `PK = TENANT#<tid>, SK = TICKET#<ticket_id>`              |
| 4   | Open tickets for a user, newest first      | GSI1    | Query                         | `GSI1PK = USER#<uid>#STATUS#OPEN`, desc                   |
| 5   | Tenant tickets with status X, newest first | GSI1    | Query+Filter or separate GSI2 | see notes                                                 |
| 6   | Ticket plus comments                       | Primary | Query                         | `PK = TENANT#<tid> AND SK begins_with TICKET#<ticket_id>` |

Notes: query 5 does not fit GSI1 cleanly (the PK is scoped to a user). Either add GSI2 with `GSI2PK = TENANT#<tid>#STATUS#X, GSI2SK = <created_at>`, or accept that status-per-tenant is less common and run a Query on GSI1 per user. Ask the user which matters more.

## This repo's conventions (supio)

This repo follows the generic entity-prefix convention. When you generate or extend schema for it, match what is already in `ConversationStore` and `UserStore`:

- The GSI is named **`GS1`** (not `GSI1`); its attributes are **`GS1PK`** and **`GS1SK`**.
- Keys use **entity-type prefixes** with the `#` separator:
  - User profile: `PK = USER#<sub>`, `SK = PROFILE`, `GS1PK = USER`, `GS1SK = <created_at_iso>`
  - Conversation header: `PK = USER#<sub>`, `SK = CONVMETA#<conversation_id>`, `GS1PK = USER#<sub>#CONV`, `GS1SK = <updated_at_iso>`
  - Message: `PK = USER#<sub>`, `SK = CONVMSG#<conversation_id>#<created_at_iso>#<message_id>`
- `GS1SK` for conversations is updated on every new message so conversation lists are most-recently-active first.
- Billing is **`PAY_PER_REQUEST`**; GSI projection is **`ALL`**; PITR is enabled in IaC.
- The table is defined in `services/backend/resources/dynamodb.yml` and included from `services/backend/serverless.yml`. All DynamoDB access stays behind `ConversationStore` and `UserStore` in `services/backend/app/db/stores.py`.
- Changing key prefixes, the `GS1` index name, CloudFormation logical IDs, or physical resource names can hide or replace already-deployed data. Treat any such change as a migration, not an edit.

Matching IaC snippet (CloudFormation, as in `resources/dynamodb.yml`):

```yaml
Resources:
  ApplicationTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: ${self:custom.tableName}
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: PK
          AttributeType: S
        - AttributeName: SK
          AttributeType: S
        - AttributeName: GS1PK
          AttributeType: S
        - AttributeName: GS1SK
          AttributeType: S
      KeySchema:
        - AttributeName: PK
          KeyType: HASH
        - AttributeName: SK
          KeyType: RANGE
      GlobalSecondaryIndexes:
        - IndexName: GS1
          KeySchema:
            - AttributeName: GS1PK
              KeyType: HASH
            - AttributeName: GS1SK
              KeyType: RANGE
          Projection:
            ProjectionType: ALL
      PointInTimeRecoverySpecification:
        PointInTimeRecoveryEnabled: true
```

## Output format

Always produce:

1. A brief restatement of the access patterns (numbered).
2. The key format table.
3. The access pattern -> key table.
4. The IaC snippet for the table definition (CloudFormation YAML for this repo).
5. Any caveats (single hot key / monotonic keys, eventual consistency, item size bounds).
