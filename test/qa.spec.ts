// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * Q&A (Product Questions) — E2E spec
 *
 * Covers: ask question, answer, approve, moderation gating (unapproved
 * questions hidden from public), delete (own vs admin vs other user),
 * non-existent product.
 */
import { INestApplication } from '@nestjs/common';
import { getTestApp, closeTestApp } from './helpers/app';
import { prisma, cleanDatabase, createUser } from './helpers/db';
import { cleanQATables, makeShopper } from './helpers/factories';
import { QaService } from '../backend/src/qa/qa.service';

let app: INestApplication;
let qaSvc: QaService;

beforeAll(async () => {
  app = await getTestApp();
  qaSvc = app.get(QaService);
});

afterAll(async () => {
  await closeTestApp();
});

beforeEach(async () => {
  await cleanQATables();
  await cleanDatabase();
});

// ─── QA-H01: ask a question ─────────────────────────────────────────────────

it('QA-H01: user can ask a question on a product', async () => {
  const s = await makeShopper();
  const q = await qaSvc.ask(s.user.id, s.product.id, 'Is this machine washable?');
  expect(q.id).toBeDefined();
  expect(q.question).toBe('Is this machine washable?');
  expect(q.isApproved).toBe(false);
  expect(q.answer).toBeNull();
});

// ─── QA-H02: unapproved questions not visible publicly ──────────────────────

it('QA-H02: getForProduct only returns approved questions', async () => {
  const s = await makeShopper();
  // Ask — starts as unapproved
  await qaSvc.ask(s.user.id, s.product.id, 'Hidden question?');

  const publicList = await qaSvc.getForProduct(s.product.id);
  expect(publicList).toHaveLength(0);
});

// ─── QA-H03: admin answers question → auto-approves ────────────────────────

it('QA-H03: admin answer auto-approves the question', async () => {
  const s = await makeShopper();
  const admin = await createUser();
  const q = await qaSvc.ask(s.user.id, s.product.id, 'What fabric is this?');

  const answered = await qaSvc.answer(q.id, admin.id, 'It is 100% cotton.');
  expect(answered.answer).toBe('It is 100% cotton.');
  expect(answered.isApproved).toBe(true);
  expect(answered.answeredBy).toBe(admin.id);

  const publicList = await qaSvc.getForProduct(s.product.id);
  expect(publicList).toHaveLength(1);
  expect(publicList[0].answer).toBe('It is 100% cotton.');
});

// ─── QA-H04: admin can approve without answering ────────────────────────────

it('QA-H04: admin approve makes question publicly visible', async () => {
  const s = await makeShopper();
  const q = await qaSvc.ask(s.user.id, s.product.id, 'Ships fast?');
  await qaSvc.approve(q.id);

  const list = await qaSvc.getForProduct(s.product.id);
  expect(list).toHaveLength(1);
  expect(list[0].isApproved).toBe(true);
});

// ─── QA-H05: getPending returns only unapproved ─────────────────────────────

it('QA-H05: getPending returns only unapproved questions', async () => {
  const s = await makeShopper();
  const admin = await createUser();

  const q1 = await qaSvc.ask(s.user.id, s.product.id, 'Pending Q1?');
  const q2 = await qaSvc.ask(s.user.id, s.product.id, 'Pending Q2?');
  // Answer q1 → auto-approve
  await qaSvc.answer(q1.id, admin.id, 'Yes');

  const pending = await qaSvc.getPending();
  const pendingIds = pending.map((p: any) => p.id);
  expect(pendingIds).not.toContain(q1.id);
  expect(pendingIds).toContain(q2.id);
});

// ─── QA-H06: user can delete their own question ─────────────────────────────

it('QA-H06: user can delete their own question', async () => {
  const s = await makeShopper();
  const q = await qaSvc.ask(s.user.id, s.product.id, 'Can I return this?');

  await qaSvc.deleteQuestion(q.id, s.user.id, false);

  const deleted = await prisma.productQuestion.findUnique({ where: { id: q.id } });
  expect(deleted).toBeNull();
});

// ─── QA-E01: user cannot delete another user's question ────────────────────

it('QA-E01: user cannot delete another user\'s question', async () => {
  const s = await makeShopper();
  const otherUser = await createUser();
  const q = await qaSvc.ask(s.user.id, s.product.id, 'My question?');

  await expect(
    qaSvc.deleteQuestion(q.id, otherUser.id, false),
  ).rejects.toThrow(/forbidden/i);

  const still = await prisma.productQuestion.findUnique({ where: { id: q.id } });
  expect(still).not.toBeNull();
});

// ─── QA-H07: admin can delete any question ──────────────────────────────────

it('QA-H07: admin can delete any question regardless of author', async () => {
  const s = await makeShopper();
  const adminUser = await createUser();
  const q = await qaSvc.ask(s.user.id, s.product.id, 'Off-topic spam?');

  await qaSvc.deleteQuestion(q.id, adminUser.id, true);

  const deleted = await prisma.productQuestion.findUnique({ where: { id: q.id } });
  expect(deleted).toBeNull();
});

// ─── QA-E02: ask on nonexistent product → NotFoundException ─────────────────

it('QA-E02: asking on nonexistent product throws NotFoundException', async () => {
  const user = await createUser();
  await expect(
    qaSvc.ask(user.id, 999999, 'Is this real?'),
  ).rejects.toThrow(/not found/i);
});

// ─── QA-H08: multiple questions on same product ─────────────────────────────

it('QA-H08: multiple questions from different users visible after approval', async () => {
  const s1 = await makeShopper();
  const s2 = await makeShopper();
  const admin = await createUser();

  // Both users ask about the same product
  const q1 = await qaSvc.ask(s1.user.id, s1.product.id, 'Question from user 1?');
  const q2 = await qaSvc.ask(s2.user.id, s1.product.id, 'Question from user 2?');

  await qaSvc.approve(q1.id);
  await qaSvc.answer(q2.id, admin.id, 'Answer for Q2');

  const list = await qaSvc.getForProduct(s1.product.id);
  expect(list.length).toBeGreaterThanOrEqual(2);
});

// ─── QA-E03: delete nonexistent question → NotFoundException ────────────────

it('QA-E03: deleting nonexistent question throws NotFoundException', async () => {
  const user = await createUser();
  await expect(
    qaSvc.deleteQuestion(999999, user.id, false),
  ).rejects.toThrow(/not found/i);
});
