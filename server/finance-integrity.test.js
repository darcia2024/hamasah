const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestDatabase } = require('./test-support/database.js');
const { createOperationsService } = require('./operations-service.js');
const { createPostgresOperationsStore } = require('./postgres-operations-store.js');
const { createCourseShopService } = require('./course-shop-service.js');
const { createPostgresLmsStore } = require('./postgres-lms-store.js');

test('isolated finance/shop: serialization, rollback, payment retry and reconciliation', async () => {
  const database = await createTestDatabase();
  try {
    const studentId = randomUUID(), accountId = randomUUID(), courseId = randomUUID();
    await database.query(`INSERT INTO accounts (id,email,name,role,password_hash,lifecycle) VALUES ($1,'finance-shop@example.test','Dummy','student','dummy','active')`, [accountId]);
    await database.query(`INSERT INTO students (id,name,program,city,join_date,status,student_account_id) VALUES ($1,'Dummy','Hamasah Courses','Test','2026-01-01','active',$2)`, [studentId, accountId]);
    await database.query(`INSERT INTO courses (id,title,description) VALUES ($1,'Dummy course','Isolated')`, [courseId]);
    await database.query(`INSERT INTO course_listings (course_id,price_rupiah,published) VALUES ($1,100000,true)`, [courseId]);
    const store = createPostgresOperationsStore({ database });
    const operations = createOperationsService({ store, now: () => '2026-10-23T00:00:00.000Z' });
    const shop = createCourseShopService({ database, operationsService: operations, lmsStore: createPostgresLmsStore({ database }) });
    const actor = { id: accountId, role: 'student' };
    // Abort after invoice insert: order and counter must roll back together.
    const failing = createCourseShopService({ database, operationsService: { async issueCourseInvoice(...args) { await operations.issueCourseInvoice(...args); throw new Error('injected order failure'); } } });
    await assert.rejects(failing.buy(courseId, actor), /injected order failure/);
    assert.equal((await store.listInvoices()).length, 0);
    const purchases = await Promise.all(Array.from({ length: 8 }, () => shop.buy(courseId, actor)));
    assert.equal(purchases.filter((r) => !r.value.existing).length, 1);
    assert.equal(new Set(purchases.map((r) => r.value.orderId)).size, 1);
    const [invoice] = await store.listInvoices();
    assert.match(invoice.number, /00001$/);
    assert.equal(await shop.onInvoicePaid(invoice.id), null);
    const finance = { role: 'finance' };
    // Detail persistence fails after paid commit; the next call must fill it.
    const interrupted = createOperationsService({ store: { ...store, async savePaymentDetail() { throw new Error('injected detail failure'); } }, now: () => '2026-10-23T00:00:00.000Z' });
    await assert.rejects(interrupted.markInvoicePaid(invoice.id, finance, { paidOn: '2026-10-23', method: 'transfer' }), /injected detail failure/);
    const paid = await operations.markInvoicePaid(invoice.id, finance);
    assert.equal(paid.changed, false);
    const detail = { paidOn: '2026-10-23', method: 'transfer', note: 'Recovered detail' };
    const retry = await operations.markInvoicePaid(invoice.id, finance, detail);
    assert.equal(retry.changed, false);
    assert.equal(retry.paymentDetailSaved, true);
    assert.equal(retry.value.receiptNumber, paid.value.receiptNumber);
    assert.equal(retry.value.payment.note, detail.note);
    await operations.markInvoicePaid(invoice.id, finance, { ...detail, note: 'Must not overwrite' });
    assert.equal((await operations.getInvoice(invoice.id, finance)).payment.note, detail.note);
    assert.equal((await shop.reconcilePaidInvoices(actor)).status, 403);
    const report = await shop.reconcilePaidInvoices(finance);
    assert.equal(report.value.reconciled.length, 1);
    assert.deepEqual(report.value.failed, []);
    assert.equal((await shop.reconcilePaidInvoices(finance)).value.checked, 0);
    assert.equal((await shop.buy(courseId, actor)).status, 409);
    await shop.onInvoicePaid(invoice.id);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM course_enrollments')).rows[0].n, 1);

    const created = await operations.saveInventory({ name: 'Dummy stock', location: 'Test', quantity: 10 }, finance);
    const id = created.value.id;
    assert.equal((await operations.saveInventory({ ...created.value, quantity: 90 }, finance)).ok, false);
    assert.equal((await operations.moveInventory(id, { direction: 'correction', quantity: 5, delta: -2, reason: 'Mismatch' }, finance)).ok, false);
    const moves = await Promise.all(Array.from({ length: 4 }, () => operations.moveInventory(id, { direction: 'out', quantity: 2, reason: 'Dummy use' }, finance)));
    assert.ok(moves.every((r) => r.ok));
    const ledger = await store.listInventoryMovements(id);
    assert.equal(ledger.length, 5);
    assert.equal(ledger.reduce((n, r) => n + r.delta, 0), 2);
    assert.deepEqual(ledger.filter((r) => r.direction === 'out').map((r) => r.beforeQuantity).sort((a,b) => a-b), [4,6,8,10]);
    assert.ok(ledger.every((r) => r.beforeQuantity + r.delta === r.afterQuantity));
    assert.equal((await operations.moveInventory(id, { direction: 'out', quantity: 3, reason: 'Too many' }, finance)).ok, false);
    assert.equal((await store.listInventoryMovements(id)).length, 5);
    const correction = await operations.moveInventory(id, { direction: 'correction', quantity: 1, delta: -1, reason: 'Dummy recount' }, finance);
    assert.equal(correction.value.movement.beforeQuantity, 2);
    assert.equal(correction.value.movement.afterQuantity, 1);
    assert.equal((await store.listInventoryMovements(id)).find((m) => m.direction === 'correction').delta, -1);
    const zero = await operations.saveInventory({ name: 'Empty stock', location: 'Test', quantity: 0 }, finance);
    assert.equal((await store.listInventoryMovements(zero.value.id))[0].delta, 0);
  } finally { await database.close(); }
});
