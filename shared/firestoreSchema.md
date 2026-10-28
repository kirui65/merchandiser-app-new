# Firestore Schema Reference

Source of truth for collection shapes used by `backend/src/models/*` (Zod)
and referenced by the mobile app and admin dashboard. Keep this file in
sync whenever a model changes.

## `reps`
```
{
  id: string,
  name: string,
  phone: string,
  email: string,
  passwordHash: string,
  role: 'rep' | 'manager' | 'brand_ambassador' | 'telemarketer' | 'team_leader' | 'recruiter',
  assignedOutletIds: string[],
  active: boolean,
  createdAt: Timestamp
}
```
The `rep` role string is retained for existing accounts and is presented as
“Merchandiser” in role-management UI. Provisionable types are merchandiser
(`rep`), brand ambassador, telemarketer, team leader, campaign recruiter, and
manager (`manager` remains the admin-equivalent).

Login may include a selected `role` as a user-experience check. The server
authenticates the email/password first, maps `merchandiser` to stored `rep`
and `admin` to stored `manager`, then rejects a mismatch with HTTP 403. The
selected role never determines the role in the returned user or JWT.

## `outlets`
```
{
  id: string,
  name: string,
  location: GeoPoint,
  address: string,
  assignedRepId: string,
  territoryId?: string,
  active: boolean
}
```

## `territories`
```
{
  id: string,
  name: string,
  description?: string
}
```

## `regions`
```
{
  id: string,
  name: string,
  countryCode: string,
  active: boolean,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

## `teams`
```
{
  id: string,
  name: string,
  teamLeaderId: string,
  regionId: string,
  active: boolean,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```
Only managers can create or manage teams and regions. A team leader's
`teamIds` are loaded from active team documents on every authenticated API
request; they are intentionally not stored in JWT claims.

## `teamMemberships`
```
{
  id: string, // deterministic `${teamId}_${repId}`
  teamId: string,
  repId: string,
  status: 'active' | 'ended',
  startedAt: Timestamp,
  endedAt?: Timestamp | null,
  createdAt: Timestamp
}
```
Field users may have one active team membership at a time because field
records have a singular `teamId`. Membership changes are manager-managed.
Ending a membership preserves its history; reassignments create/reactivate
the deterministic membership for the selected team.

## `referralRegistrations`
Recruiters submit candidate referrals for active recruitment campaigns
assigned directly to their account or assigned to their active team. Team
membership is optional for directly assigned recruiters. The server stamps ownership and consent time,
normalizes Kenyan mobile numbers, and uses a deterministic campaign/phone ID
to prevent duplicate submissions.
```
{
  id: string,
  campaignId: string,
  recruiterId: string | null,
  teamId: string | null,
  source: 'recruiter_app' | 'web_ad' | 'web_engagement',
  campaignSlug?: string, // original public-ad campaign link
  applicantName: string,
  applicantIdNumber: string,
  phone: string,
  email: string,
  county: string,
  education: 'KCPE' | 'KCSE' | 'certificate' | 'diploma' | 'degree' | 'postgraduate' | 'other',
  passportStatus: 'has_passport' | 'will_get_self_funded' | 'not_ready',
  nitaFeeStatus: 'not_paid' | 'paid',
  applicantConsent: true,
  applicantConsentAt: Timestamp,
  submittedAt?: Timestamp, // web-ad submission time
  convertedAt?: Timestamp,
  convertedBy?: string,
  status: 'submitted' | 'contacted' | 'requirements_checked' | 'training_scheduled' | 'placed' | 'rejected',
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```
Recruitment campaigns include `programType`, `referralCommissionKsh`, and
`referralCommissionAt`. Candidate salary from advertisements is separate
from recruiter commission. Status changes and payment references are stored
in `referralRegistrationEvents`.

Managers can delete an individual account after re-entering their password,
confirming the account email, and providing an authenticator code if MFA is
enabled. Historical field records and audit attribution are retained. The
manager-only system reset requires password reauthentication, the exact phrase
`RESET SYSTEM DATA`, and MFA when enabled. It removes non-manager accounts,
team/campaign setup, and operational records; it keeps manager accounts,
products, outlets, territories, regions, audit logs, and security logs, and
clears outlet assignments. The reset is recorded in `auditLog` and
`systemOperations`.

## `auditLog`

Manager-only audit entries for roster, product, and outlet mutations:

```js
{
  actorId: string,
  actorRole: 'manager',
  action: 'created' | 'edited' | 'deactivated' | 'reactivated' | 'password_reset',
  entityType: 'rep' | 'product' | 'outlet',
  entityId: string,
  entityName: string,
  changedFields: string[],
  createdAt: Timestamp
}
```

## `products`
```
{
  id: string,
  name: string,
  sku: string,
  defaultPrice: number,
  category: string,
  active: boolean
}
```

## `sales`
```
{
  id: string,
  localId: string,        // client-generated UUID, idempotency key
  repId: string,
  teamId: string | null,
  outletId: string,
  productId: string,
  qty: number,
  unitPrice: number,
  total: number,
  campaignId?: string | null,
  timestamp: Timestamp,
  photoUrl: string | null,
  syncStatus: 'pending' | 'synced' | 'failed',
  saleStatus: 'active' | 'voided',
  voidReason?: string,
  voidedAt?: Timestamp,
  voidedBy?: string,
  updatedAt?: Timestamp,
  createdAt: Timestamp
}
```
`teamId` is resolved server-side from the rep's active team membership.
When supplied, `campaignId` must reference a campaign assigned to that
active team. Existing sales without a campaign ID remain unattributed.
Idempotency: `(repId, localId)` must be unique. A duplicate write with the
same `localId` from the same rep returns the existing record, not an error.
Reps may edit a sale during the first 15 minutes after server creation. A
voided sale is retained with its reason and actor/time metadata, shown in
history, and excluded from sales totals and future reconciliation runs.

## `leads`
```
{
  id: string,
  telemarketerId: string,
  teamId: string | null,
  campaignId: string | null,
  name: string,
  organization?: string,
  phone: string,
  email?: string,
  source?: string,
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'not_interested' | 'closed',
  score: 'hot' | 'warm' | 'cold' | 'unscored',
  scoreValue?: number,
  nextFollowUpAt?: Timestamp,
  lastCalledAt?: Timestamp,
  callCount: number,
  notes?: string,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```
`teamId` is resolved by the backend from the submitter's current active
`teamMemberships` record and active team; values supplied by clients are
never trusted. If a user has no active team, the record stores `null`. If a
user has multiple active teams, field writes are rejected until membership
is corrected.
`telemarketerId` is always taken from the authenticated user. `teamId` is
resolved from the authenticated user's active team membership at write time.

## `calls`
```
{
  id: string,
  leadId: string,
  telemarketerId: string,
  teamId: string | null,
  campaignId?: string,
  startedAt: Timestamp,
  endedAt?: Timestamp,
  durationSeconds?: number,
  outcome: 'answered' | 'no_answer' | 'busy' | 'voicemail' | 'callback_requested' | 'wrong_number',
  notes?: string,
  followUpAt?: Timestamp,
  statusAfterCall?: 'new' | 'contacted' | 'qualified' | 'converted' | 'not_interested' | 'closed',
  scoreAfterCall?: 'hot' | 'warm' | 'cold' | 'unscored',
  createdAt: Timestamp
}
```
Calls are created in the same Firestore transaction that increments the
lead's `callCount`, sets `lastCalledAt`, and applies any follow-up/status/
score changes. Their `campaignId` is copied from the associated lead.

## `activations`
```
{
  id: string,
  ambassadorId: string,
  teamId: string | null,
  campaignId: string | null,
  activityType: 'product_sampling' | 'roadshow' | 'in_store_demo' | 'street_activation',
  status: 'draft' | 'submitted' | 'approved' | 'rejected',
  location: GeoPoint,
  startedAt: Timestamp,
  endedAt?: Timestamp,
  footfallCount: number,
  media: [{ storageUri: string, mediaType: 'photo' | 'video', contentType: string, capturedAt: Timestamp }],
  surveyResponses: [{ questionId: string, answer: string, respondentConsent: boolean, capturedAt: Timestamp }],
  samplesDistributed: [{ productId: string, quantity: number, unit?: string }],
  floatAmount: number,
  expenses: [{ expenseType: string, amount: number, receiptStorageUri?: string, description?: string, incurredAt: Timestamp }],
  floatRemaining?: number,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```
Activity types are currently controlled to `product_sampling`, `roadshow`,
`in_store_demo`, and `street_activation`. Float and expense amounts are
plain KES numbers, consistent with `sales.total`. Brand ambassadors own
their activation records; they can edit drafts and submit them. Managers
can approve/reject submitted activations. Team-leader review scope is
deferred to Phase 4.

## `merchandisingAudits`
```
{
  id: string,
  merchandiserId: string,
  teamId: string | null,
  outletId: string,
  campaignId?: string,
  location?: { lat: number, lng: number },
  observedAt: Timestamp,
  stockChecks: [{ productId: string, shelfQuantity?: number, backroomQuantity?: number, lowStock: boolean, reorderRequested: boolean }],
  planogram: { standardId?: string, compliant: boolean, compliancePercent?: number, deviations: [{ productId?: string, expectedPosition?: string, actualPosition?: string, description?: string }] },
  photoStorageUris: string[],
  notes?: string,
  createdAt: Timestamp
}
```

## `competitorPrices`
```
{
  id: string,
  merchandiserId: string,
  teamId: string | null,
  outletId: string,
  campaignId?: string,
  competitorName: string,
  competitorProductName: string,
  competitorSku?: string,
  ourProductId?: string,
  price: number,
  observedAt: Timestamp,
  photoStorageUri?: string,
  createdAt: Timestamp
}
```
Prices are plain float KES values, consistent with `sales.total`.

## `outletOnboarding`
```
{
  id: string,
  submittedBy: string,
  name: string,
  address: string,
  location: { lat: number, lng: number },
  photoStorageUri: string,
  status: 'pending_review' | 'approved' | 'rejected',
  outletId?: string,
  createdAt: Timestamp,
  reviewedAt?: Timestamp,
  reviewedBy?: string
}
```
New field-sourced outlets remain in `outletOnboarding` until a manager
approves them. Approval creates the active `outlets` document and links its
ID back to the request; rejected/pending submissions never appear in the
operational outlet list.

## `broadcasts`
```
{
  id: string,
  teamId: string,
  senderId: string,
  title: string,
  message: string,
  status: 'draft' | 'published' | 'archived',
  publishedAt?: Timestamp,
  expiresAt?: Timestamp | null,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```
Team leaders can create broadcasts only for teams they lead. Team members
can read published, unexpired broadcasts for their active team.

## `fieldRequests`
```
{
  id: string,
  requesterId: string,
  teamId: string,
  requestType: 'leave' | 'field',
  startsAt: Timestamp,
  endsAt?: Timestamp | null,
  reason?: string,
  status: 'pending' | 'approved' | 'rejected',
  reviewedBy?: string | null,
  reviewedAt?: Timestamp | null,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```
The backend resolves `teamId` from the requester's active membership.
Team leaders may approve/reject requests for their active teams; managers
may review across teams.

## `campaigns`
```
{
  id: string,
  clientName: string,
  name: string,
  description?: string,
  regionIds: string[],
  teamIds: string[],
  recruiterIds: string[], // direct recruiter assignments for candidate recruitment campaigns
  status: 'draft' | 'active' | 'paused' | 'completed' | 'archived',
  programType: 'field_sales' | 'candidate_recruitment',
  referralCommissionKsh?: number | null,
  referralCommissionAt?: 'requirements_checked' | 'training_scheduled' | 'placed' | null,
  startsAt: Timestamp,
  endsAt?: Timestamp | null,
  createdBy: string,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```
Managers (`role === 'manager'`) create, update, and archive campaigns.
Campaign team assignments are validated against active teams, and assigned
teams must belong to one of the campaign's assigned regions. Direct recruiter
assignments are validated against active recruiter accounts. A recruiter can
access a candidate recruitment campaign through a direct assignment or a
legacy team assignment; recruiters do not need a team when directly assigned.
When a field
record includes `campaignId`, the backend verifies the campaign is assigned
to the writer's server-resolved team. Historical field records without a
campaign ID remain unattributed rather than being guessed from current
team assignments. Region filtering in the company report uses each team's
current `regionId`; historical team-region changes are not snapshotted.

The company report filters each collection using its activity date:
`sales.timestamp`, `activations.startedAt`, `leads.createdAt`, and
`merchandisingAudits.observedAt`. Sales from the legacy numeric, ISO-string,
and Firestore Timestamp date encodings are included.

## `salesTargets`

One deterministic document per representative and calendar month (`{repId}_{YYYY-MM}`):

```js
{
  repId: string,
  month: 'YYYY-MM',
  amount: number,
  createdAt: Timestamp
}
```

## `routes` (one doc per rep per day)
```
{
  id: string,             // e.g. `${repId}_${YYYY-MM-DD}`
  repId: string,
  date: string,            // YYYY-MM-DD
  pings: [{ lat: number, lng: number, timestamp: Timestamp }],
  plannedOutletIds: string[],
  visitedOutletIds: string[]
}
```

## `mpesaTransactions`
```
{
  id: string,
  repId: string,
  outletId: string | null,   // inferred later by reconciliation
  amount: number,
  mpesaReceiptNumber: string,
  phoneNumber: string,
  timestamp: Timestamp,
  status: string,
  matchedSaleId: string | null
}
```
Written only by the backend via the Daraja callback — never directly by
a client.

## Access control

All writes go through the Express API using the Firebase **Admin SDK**,
which bypasses `firestore/firestore.rules`. The rules file is a
defense-in-depth backstop only. Real authorization lives in
`backend/src/middleware/auth.middleware.js` and must be enforced in every
controller:
- A rep may only read/write `sales` and `routes` docs where `repId` matches
  their own JWT-authenticated `uid`.
- A manager (`role === 'manager'`) may read everything.
- A team leader's active `teamIds` are read from Firestore after every JWT
  verification. Team leaders can only read records with stored `teamId`
  values belonging to those teams and cannot write field sales, activations,
  leads, calls, or merchandising records.
- Team and membership changes take effect on the next request because team
  IDs are never embedded in JWT claims. Field workers have one active team
  membership so new records receive an unambiguous server-derived `teamId`.
- Team leaders can publish broadcasts for their teams and review field
  requests only for those teams.
- A telemarketer may only read and update leads/calls owned by their JWT uid.
- A brand ambassador may only read/write activations owned by their JWT uid.
- A manager may read all activations and review submitted activations.
- A merchandiser (`role === 'rep'`) may only read/write their own
  merchandising audits, competitor prices, and outlet onboarding requests.
- Managers can read and manage all merchandising records, review outlet
  onboarding, and create the approved outlet.
- No client role may write `mpesaTransactions` directly.

Required composite indexes for telemarketer queries:
- `leads(telemarketerId ASC, status ASC, updatedAt DESC)`
- `leads(teamId ASC, nextFollowUpAt ASC)`
- `calls(leadId ASC, startedAt DESC)`
- `calls(telemarketerId ASC, startedAt DESC)`
- `activations(ambassadorId ASC, startedAt DESC)`
- `activations(teamId ASC, startedAt DESC)`
- `merchandisingAudits(merchandiserId ASC, observedAt DESC)`
- `merchandisingAudits(outletId ASC, observedAt DESC)`
- `competitorPrices(outletId ASC, observedAt DESC)`
- `competitorPrices(ourProductId ASC, observedAt DESC)`
- `outletOnboarding(submittedBy ASC, createdAt DESC)`
- `teamMemberships(teamId ASC, status ASC, startedAt DESC)`
- `teamMemberships(repId ASC, status ASC, startedAt DESC)`
- `teams(regionId ASC, active ASC, name ASC)`
- `broadcasts(teamId ASC, status ASC, publishedAt DESC)`
- `fieldRequests(teamId ASC, status ASC, createdAt DESC)`
- `fieldRequests(requesterId ASC, status ASC, createdAt DESC)`
- `campaigns(status ASC, startsAt DESC)`

The new composites are defined in `firestore/firestore.indexes.json` but
are not live until a project administrator deploys them with
`firebase deploy --only firestore:indexes`.
