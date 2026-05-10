## Summary

<!-- What does this PR do and why? -->

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Refactor (no behavior change)
- [ ] Schema change (migration required)

## Checklist

- [ ] `cd backend && npx tsc --noEmit` passes (zero type errors)
- [ ] `cd test && npx jest --runInBand --forceExit` — all 638 tests pass
- [ ] If schema changed: `npx prisma validate --schema prisma/schema.prisma` passes
- [ ] If schema changed: migration file is included and reviewed

## Financial / Inventory Code

*If this PR touches wallet, orders, payments, inventory, or refunds — complete this section:*

- [ ] Which invariants (I-1 through I-13) are affected?
- [ ] Is there any check-then-act pattern? If yes, how is it eliminated?
- [ ] Are concurrent execution scenarios traced and safe?

## Testing

<!-- Describe how you tested this change. New test added? Existing test updated? -->

## DCO Sign-Off

By submitting this PR, I certify that my contribution is my original work and I have the right to submit it under the Elastic License 2.0 (ELv2).

<!-- Sign your commits with: git commit -s -m "your message" -->
