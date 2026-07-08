## What & why

<!-- Summary of the change and the problem it solves. Link the issue. -->

## Decision record (DR-007 — living-document mandate)

- [ ] This PR makes a **structural** change (data model, module public interface, permission, business rule) **or** an **integration** change (adding/removing/reconfiguring an external service, webhook, or credential model).
  - If checked: a dated entry was added to `docs/decisions/DECISION_LOG.md` **and** the affected volume(s) updated, and the decision ID is referenced below.
- [ ] Not a structural/integration change.

**Decision ID(s):** <!-- e.g. DR-008 -->

## Definition of Done (Vol. 10 §10.3)

- [ ] Six-question gate answered (role · process · DB · API · security · testing)
- [ ] Module boundaries respected; no cross-module table access; no business logic in the frontend
- [ ] Unit + API + security tests added and green
- [ ] OpenAPI updated (if endpoints changed); migration reviewed for zero-downtime
- [ ] EN + FR strings complete; accessibility pass on new UI
- [ ] Observability: new failure modes have logs/metrics and a problem+json type
