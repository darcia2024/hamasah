const assert = require('node:assert/strict');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');
const { createTestDatabase } = require('./test-support/database.js');
const { decryptNotificationPayload } = require('./notification-payload.js');

async function request(baseUrl, pathname, options) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  if (response.status === 204) {
    return { status: response.status, body: null };
  }
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text();
  return { status: response.status, body };
}

async function run() {
  const database = await createTestDatabase();
  const app = createHamasahApp({
    rootDirectory: path.resolve(__dirname, '..'),
    database,
    bootstrapKey: 'bootstrap-test-key'
  });
  const server = app.createServer();

  await new Promise(function listen(resolve) { server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const health = await request(baseUrl, '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);

    const bootstrap = await request(baseUrl, '/api/auth/bootstrap', {
      method: 'POST',
      headers: { Authorization: 'Bearer bootstrap-test-key', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Admin Hamasah', email: 'admin@hamasah.test', password: 'kata-sandi-admin-aman' })
    });
    assert.equal(bootstrap.status, 201);

    const login = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@hamasah.test', password: 'kata-sandi-admin-aman' })
    });
    assert.equal(login.status, 200);
    const adminHeaders = { Authorization: `Bearer ${login.body.accessToken}`, 'Content-Type': 'application/json' };
    const account = await request(baseUrl, '/api/accounts', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name: 'Petugas Pendaftaran', email: 'petugas@hamasah.test', role: 'registration-officer', password: 'kata-sandi-petugas-aman' })
    });
    assert.equal(account.status, 201);

    const parentAccount = await request(baseUrl, '/api/accounts', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name: 'Wali Fikri', email: 'wali@hamasah.test', role: 'parent', password: 'kata-sandi-wali-aman' })
    });
    const studentAccount = await request(baseUrl, '/api/accounts', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name: 'Fikri Santri', email: 'santri@hamasah.test', role: 'student', password: 'kata-sandi-santri-aman' })
    });
    assert.equal(parentAccount.status, 201);
    assert.equal(studentAccount.status, 201);

    const studentCreated = await request(baseUrl, '/api/students', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        name: 'Fikri Santri', program: 'Kuliah Al-Azhar', city: 'Kairo', joinDate: '2026-08-20',
        studentAccountId: studentAccount.body.account.id, parentAccountIds: [parentAccount.body.account.id]
      })
    });
    assert.equal(studentCreated.status, 201);
    const studentId = studentCreated.body.student.id;
    const attendance = await request(baseUrl, `/api/students/${studentId}/attendance`, {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ status: 'present', category: 'Subuh berjamaah' })
    });
    assert.equal(attendance.status, 201);
    const parentLogin = await request(baseUrl, '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'wali@hamasah.test', password: 'kata-sandi-wali-aman' })
    });
    const parentDashboard = await request(baseUrl, `/api/students/${studentId}/dashboard`, {
      headers: { Authorization: `Bearer ${parentLogin.body.accessToken}` }
    });
    assert.equal(parentDashboard.status, 200);
    assert.equal(parentDashboard.body.dashboard.attendance.rate, 100);
    const parentStudents = await request(baseUrl, '/api/my-students', {
      headers: { Authorization: `Bearer ${parentLogin.body.accessToken}` }
    });
    assert.equal(parentStudents.status, 200);
    assert.equal(parentStudents.body.items.length, 1);
    // Regresi keamanan: santri yang tidak ada tidak boleh bisa ditagih.
    // Jika pemeriksaan keberadaan santri lupa di-await, Promise selalu dianggap benar
    // dan invoice akan terbentuk untuk santri yang tidak ada.
    const invoiceSantriFiktif = await request(baseUrl, '/api/operations/invoices', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ studentId: '00000000-0000-4000-8000-000000000000', description: 'SPP September', amount: 1500000 })
    });
    assert.equal(invoiceSantriFiktif.status, 422);

    // Regresi keamanan: wali lain tidak boleh melihat rekam jejak santri ini.
    const waliLain = await request(baseUrl, '/api/accounts', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ name: 'Wali Lain', email: 'wali-lain@hamasah.test', role: 'parent', password: 'kata-sandi-wali-lain-aman' })
    });
    assert.equal(waliLain.status, 201);
    const waliLainLogin = await request(baseUrl, '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'wali-lain@hamasah.test', password: 'kata-sandi-wali-lain-aman' })
    });
    const waliLainHeaders = { Authorization: `Bearer ${waliLainLogin.body.accessToken}`, 'Content-Type': 'application/json' };
    const dashboardWaliLain = await request(baseUrl, `/api/students/${studentId}/dashboard`, { headers: waliLainHeaders });
    assert.equal(dashboardWaliLain.status, 403);
    const daftarWaliLain = await request(baseUrl, '/api/my-students', { headers: waliLainHeaders });
    assert.equal(daftarWaliLain.status, 200);
    assert.equal(daftarWaliLain.body.items.length, 0);
    const laporanWaliLain = await request(baseUrl, `/api/students/${studentId}/report`, { headers: waliLainHeaders });
    assert.equal(laporanWaliLain.status, 403);

    const invoice = await request(baseUrl, '/api/operations/invoices', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ studentId, description: 'SPP September', amount: 1500000 })
    });
    assert.equal(invoice.status, 201);
    assert.match(invoice.body.invoice.number, /^INV\/HI\/\d{4}\/00001$/);
    const paidInvoice = await request(baseUrl, `/api/operations/invoices/${invoice.body.invoice.id}/paid`, { method: 'PATCH', headers: adminHeaders });
    assert.equal(paidInvoice.status, 200);
    assert.match(paidInvoice.body.invoice.receiptNumber, /^KWT\/HI\/2026\//);
    const visa = await request(baseUrl, '/api/operations/visas', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ studentId, status: 'collecting-documents', note: 'Paspor diperiksa.' })
    });
    assert.equal(visa.status, 201);
    const operations = await request(baseUrl, '/api/operations', { headers: adminHeaders });
    assert.equal(operations.status, 200);
    assert.equal(operations.body.invoices.length, 1);
    const report = await request(baseUrl, `/api/students/${studentId}/report`, {
      headers: { Authorization: `Bearer ${parentLogin.body.accessToken}` }
    });
    assert.equal(report.status, 200);
    assert.match(report.body, /Fikri Santri/);
    const accounts = await request(baseUrl, '/api/accounts', { headers: adminHeaders });
    assert.equal(accounts.status, 200);
    assert.equal(accounts.body.items.length, 5);

    const courseCreated = await request(baseUrl, '/api/courses', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ title: 'Nahwu Dasar', description: 'Pengantar susunan kalimat bahasa Arab.' })
    });
    assert.equal(courseCreated.status, 201);
    const courseId = courseCreated.body.course.id;
    const allCourses = await request(baseUrl, '/api/courses', { headers: adminHeaders });
    assert.equal(allCourses.status, 200);
    assert.equal(allCourses.body.items.length, 1);
    const materialCreated = await request(baseUrl, `/api/courses/${courseId}/materials`, {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({
        type: 'video', title: 'Jumlah Ismiyyah', content: 'Pembahasan mubtada dan khabar.',
        summary: 'Jumlah ismiyyah tersusun dari mubtada dan khabar.', keyPoints: ['Mubtada', 'Khabar'],
        studyGuide: [{ question: 'Apa fungsi khabar?', answer: 'Khabar menyempurnakan makna mubtada.' }]
      })
    });
    assert.equal(materialCreated.status, 201);
    const enrolled = await request(baseUrl, `/api/students/${studentId}/courses/${courseId}`, {
      method: 'POST', headers: adminHeaders
    });
    assert.equal(enrolled.status, 204);
    const studentLogin = await request(baseUrl, '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'santri@hamasah.test', password: 'kata-sandi-santri-aman' })
    });
    const studentHeaders = { Authorization: `Bearer ${studentLogin.body.accessToken}`, 'Content-Type': 'application/json' };
    const studentCourses = await request(baseUrl, `/api/students/${studentId}/courses`, {
      headers: studentHeaders
    });
    assert.equal(studentCourses.status, 200);
    assert.equal(studentCourses.body.items.length, 1);
    const completed = await request(baseUrl, `/api/students/${studentId}/courses/${courseId}/materials/${materialCreated.body.material.id}/complete`, {
      method: 'POST', headers: studentHeaders
    });
    assert.equal(completed.status, 200);
    assert.equal(completed.body.course.progress, 100);
    const studyHelp = await request(baseUrl, `/api/students/${studentId}/courses/${courseId}/materials/${materialCreated.body.material.id}/study-help`, {
      method: 'POST', headers: studentHeaders,
      body: JSON.stringify({ question: 'Apa fungsi khabar?' })
    });
    assert.equal(studyHelp.status, 200);
    assert.equal(studyHelp.body.help.source, 'panduan materi');

    const createdOfficerLogin = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'petugas@hamasah.test', password: 'kata-sandi-petugas-aman' })
    });
    assert.equal(createdOfficerLogin.status, 200);

    const created = await request(baseUrl, '/api/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicantName: 'Naufal Rizki',
        phone: '0812 3456 7890',
        guardianName: 'Ahmad Rizki',
        guardianPhone: '0813 2222 3333',
        email: 'naufal@hamasah.test',
        guardianEmail: 'wali-naufal@hamasah.test',
        birthDate: '2007-04-12', gender: 'putra', schoolOrigin: 'SMA Uji', guardianConsent: true,
        program: 'mahad-al-azhar',
        educationLevel: 'MA',
        city: 'Bandung',
        consent: true
      })
    });
    assert.equal(created.status, 201);
    assert.match(created.body.accessToken, /^[A-Za-z0-9_-]{30,}$/);
    assert.equal('phone' in created.body.registration, false);

    const registrationId = created.body.registration.registrationId;
    const recoveryUnknown = await request(baseUrl, '/api/applicant/recovery', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationId, email: 'bukan@naufal.test' })
    });
    assert.equal(recoveryUnknown.status, 202);
    const recovery = await request(baseUrl, '/api/applicant/recovery', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationId, email: 'naufal@hamasah.test' })
    });
    assert.equal(recovery.status, 202);
    assert.match(recovery.body.message, /kode akses baru/);
    const denied = await request(baseUrl, `/api/registrations/${registrationId}`);
    assert.equal(denied.status, 401);

    // Isi permintaan yang rusak dan yang kebesaran punya status masing-masing.
    const jsonRusak = await request(baseUrl, '/api/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bukan json'
    });
    assert.equal(jsonRusak.status, 400);
    assert.match(jsonRusak.body.error, /JSON/);

    const terlaluBesar = await request(baseUrl, '/api/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicantName: 'a'.repeat(200000) })
    });
    assert.equal(terlaluBesar.status, 413);
    assert.match(terlaluBesar.body.error, /terlalu besar/);

    const candidateHeaders = { Authorization: `Bearer ${created.body.accessToken}`, 'Content-Type': 'application/json' };
    const retrieved = await request(baseUrl, `/api/registrations/${registrationId}`, { headers: candidateHeaders });
    assert.equal(retrieved.status, 200);
    assert.equal(retrieved.body.registration.status, 'submitted');
    const applicantUpdate = await request(baseUrl, `/api/applicant/registrations/${registrationId}`, {
      method: 'PATCH', headers: candidateHeaders,
      body: JSON.stringify({ city: 'Alexandria', phone: '081234567891' })
    });
    assert.equal(applicantUpdate.status, 200, JSON.stringify(applicantUpdate.body));
    const updatedPublic = await request(baseUrl, `/api/registrations/${registrationId}`, { headers: candidateHeaders });
    assert.equal(updatedPublic.body.registration.status, 'submitted');

    const uploadRequest = await request(baseUrl, '/api/uploads', {
      method: 'POST',
      headers: candidateHeaders,
      body: JSON.stringify({
        purpose: 'registration-document', entityId: registrationId,
        fileName: 'passport.pdf', contentType: 'application/pdf', size: 5
      })
    });
    assert.equal(uploadRequest.status, 201);
    const uploaded = await fetch(`${baseUrl}/api/uploads/${uploadRequest.body.upload.id}/content`, {
      method: 'PUT', headers: { Authorization: candidateHeaders.Authorization, 'Content-Type': 'application/pdf' },
      body: Buffer.from('%PDF-test')
    });
    assert.equal(uploaded.status, 200);

    const documentAdded = await request(baseUrl, `/api/registrations/${registrationId}/documents`, {
      method: 'POST',
      headers: candidateHeaders,
      body: JSON.stringify({ type: 'passport', fileObjectId: uploadRequest.body.upload.id })
    });
    assert.equal(documentAdded.status, 201);
    assert.equal(documentAdded.body.registration.documentSummary.length, 1);
    assert.equal('storageKey' in documentAdded.body.registration.documentSummary[0], false);
    const reviewStatus = await request(baseUrl, `/api/registrations/${registrationId}/status`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${createdOfficerLogin.body.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'document-review', note: 'Berkas mulai diperiksa.' })
    });
    assert.equal(reviewStatus.status, 200);
    const rejectedDocument = await request(baseUrl, `/api/registrations/${registrationId}/documents/${documentAdded.body.registration.documentSummary[0].id}/review`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${createdOfficerLogin.body.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewStatus: 'rejected', note: 'Foto paspor kurang jelas, mohon unggah ulang.' })
    });
    assert.equal(rejectedDocument.status, 200);
    const candidateAfterReview = await request(baseUrl, `/api/registrations/${registrationId}`, { headers: candidateHeaders });
    assert.equal(candidateAfterReview.body.registration.documentSummary[0].reviewStatus, 'rejected');
    assert.equal(candidateAfterReview.body.registration.documentSummary[0].reviewNote, 'Foto paspor kurang jelas, mohon unggah ulang.');
    const needsRevision = await request(baseUrl, `/api/registrations/${registrationId}/status`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${createdOfficerLogin.body.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'needs-revision', note: 'Mohon perbaiki dokumen yang ditolak.' })
    });
    assert.equal(needsRevision.status, 200);
    const replacementUpload = await request(baseUrl, '/api/uploads', {
      method: 'POST', headers: candidateHeaders,
      body: JSON.stringify({ purpose: 'registration-document', entityId: registrationId, fileName: 'passport-replacement.pdf', contentType: 'application/pdf', size: 5 })
    });
    assert.equal(replacementUpload.status, 201);
    const replacementContent = await fetch(`${baseUrl}/api/uploads/${replacementUpload.body.upload.id}/content`, {
      method: 'PUT', headers: { Authorization: candidateHeaders.Authorization, 'Content-Type': 'application/pdf' }, body: Buffer.from('%PDF-test')
    });
    assert.equal(replacementContent.status, 200);
    const replacementDocument = await request(baseUrl, `/api/registrations/${registrationId}/documents`, {
      method: 'POST', headers: candidateHeaders,
      body: JSON.stringify({ type: 'passport', fileObjectId: replacementUpload.body.upload.id })
    });
    assert.equal(replacementDocument.status, 201);
    assert.equal(replacementDocument.body.registration.documentSummary.length, 2);
    assert.equal(replacementDocument.body.registration.status, 'document-review');

    for (const nextStatus of ['academic-preparation', 'ready-for-departure']) {
      const transitioned = await request(baseUrl, `/api/registrations/${registrationId}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${createdOfficerLogin.body.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, note: `Transisi ${nextStatus}.` })
      });
      assert.equal(transitioned.status, 200);
    }
    const converted = await request(baseUrl, `/api/registrations/${registrationId}/convert`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${createdOfficerLogin.body.accessToken}` }
    });
    assert.equal(converted.status, 200, JSON.stringify(converted.body));
    assert.equal(converted.body.conversion.alreadyConverted, false);
    assert.equal(converted.body.conversion.student.name, 'Naufal Rizki');
    assert.equal(converted.body.conversion.accounts.length, 2);
    assert.deepEqual(converted.body.conversion.accounts.map((account) => account.role).sort(), ['parent', 'student']);
    assert.ok(converted.body.conversion.accounts.every((account) => account.onboardingStatus === 'invitation-pending'));
    const queuedInvitations = await database.query("SELECT account_id, payload_ciphertext, payload_nonce, payload_tag FROM notification_outbox WHERE notification_type = 'account-invitation'");
    assert.equal(queuedInvitations.rows.length, 2);
    assert.ok(queuedInvitations.rows.every((row) => row.account_id && row.payload_ciphertext && row.payload_nonce && row.payload_tag));
    const invitationPayload = decryptNotificationPayload({
      ciphertext: queuedInvitations.rows[0].payload_ciphertext,
      nonce: queuedInvitations.rows[0].payload_nonce,
      tag: queuedInvitations.rows[0].payload_tag
    }, 'development-only-key');
    assert.equal(invitationPayload.accountId, queuedInvitations.rows[0].account_id);
    assert.match(invitationPayload.invitationToken, /^[A-Za-z0-9_-]{40,}$/);
    const convertedAgain = await request(baseUrl, `/api/registrations/${registrationId}/convert`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${createdOfficerLogin.body.accessToken}` }
    });
    assert.equal(convertedAgain.status, 200);
    assert.equal(convertedAgain.body.conversion.alreadyConverted, true);
    assert.equal(convertedAgain.body.conversion.accounts.length, 2);
    const registrationList = await request(baseUrl, '/api/registrations', {
      headers: { Authorization: `Bearer ${createdOfficerLogin.body.accessToken}` }
    });
    assert.equal(registrationList.status, 200);
    assert.equal(registrationList.body.items.length, 1);
    assert.equal(registrationList.body.items[0].applicant.applicantName, 'Naufal Rizki');
    const searchedRegistrations = await request(baseUrl, '/api/registrations?search=Naufal&page=1&pageSize=10', {
      headers: { Authorization: `Bearer ${createdOfficerLogin.body.accessToken}` }
    });
    assert.equal(searchedRegistrations.status, 200);
    assert.equal(searchedRegistrations.body.total, 1);
    assert.equal(searchedRegistrations.body.items[0].registrationId, registrationId);
    const nextStep = await request(baseUrl, `/api/registrations/${registrationId}/next-steps`, {
      method: 'POST', headers: { Authorization: `Bearer ${createdOfficerLogin.body.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Verifikasi terjemah ijazah', dueOn: '2026-10-01' })
    });
    assert.equal(nextStep.status, 201);
    assert.equal(nextStep.body.registration.nextSteps[0].title, 'Verifikasi terjemah ijazah');

    const articleDenied = await request(baseUrl, '/api/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Kegiatan baru', excerpt: 'Ringkas', body: 'Isi berita yang cukup lengkap.' })
    });
    assert.equal(articleDenied.status, 401);

    const articleCreated = await request(baseUrl, '/api/articles', {
      method: 'POST',
      headers: { Authorization: `Bearer ${createdOfficerLogin.body.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Kegiatan pembinaan pekanan',
        excerpt: 'Catatan kegiatan santri bersama pembina.',
        body: 'Kegiatan pembinaan pekanan dilaksanakan untuk menjaga ritme belajar dan kebersamaan santri.',
        category: 'Kegiatan'
      })
    });
    assert.equal(articleCreated.status, 201);

    const articles = await request(baseUrl, '/api/articles');
    assert.equal(articles.status, 200);
    assert.equal(articles.body.items.length, 1);

    const faq = await request(baseUrl, '/api/faq/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Bagaimana alur pendaftaran dan dokumen?' })
    });
    assert.equal(faq.status, 200);
    assert.equal(faq.body.topic, 'pendaftaran');

    const publicPage = await request(baseUrl, '/website/');
    assert.equal(publicPage.status, 200);
    assert.match(publicPage.body, /Hamasah International/);
    const portalPage = await request(baseUrl, '/website/portal.html');
    assert.equal(portalPage.status, 200);
    assert.match(portalPage.body, /Portal Hamasah/);
    const staffPage = await request(baseUrl, '/website/staff.html');
    assert.equal(staffPage.status, 200);
    assert.match(staffPage.body, /Konsol pendaftaran/);
    const articlePage = await request(baseUrl, '/website/article.html?slug=pendampingan-santri-di-kairo');
    assert.equal(articlePage.status, 200);
    assert.match(articlePage.body, /Pena Hamasah/);
    const monitoringPage = await request(baseUrl, '/website/monitoring.html');
    assert.equal(monitoringPage.status, 200);
    assert.match(monitoringPage.body, /Monitoring santri/);
    const lmsPage = await request(baseUrl, '/website/lms.html');
    assert.equal(lmsPage.status, 200);
    assert.match(lmsPage.body, /LMS Hamasah/);
    const operationsPage = await request(baseUrl, '/website/operations.html');
    assert.equal(operationsPage.status, 200);
    assert.match(operationsPage.body, /Keuangan, visa, dan inventaris/);

    const auditPage = await request(baseUrl, '/website/audit.html');
    assert.equal(auditPage.status, 200);
    assert.match(auditPage.body, /Siapa melakukan apa/);

    // Kejadian penting benar-benar tercatat, bukan hanya ada modulnya.
    const audit = await request(baseUrl, '/api/audit?limit=100', { headers: adminHeaders });
    assert.equal(audit.status, 200);
    const aksi = audit.body.items.map((event) => event.action);
    for (const wajib of ['account.bootstrapped', 'auth.login.success', 'account.created', 'student.created', 'registration.created', 'invoice.created']) {
      assert.ok(aksi.includes(wajib), `Kejadian ${wajib} seharusnya tercatat. Yang ada: ${[...new Set(aksi)].join(', ')}`);
    }
    // Isi catatan tidak boleh memuat kata sandi atau token, walau pemanggilnya lalai.
    const teksAudit = JSON.stringify(audit.body);
    assert.equal(teksAudit.includes('kata-sandi-admin-aman'), false, 'Kata sandi tidak boleh ada di catatan audit.');
    assert.equal(teksAudit.includes(login.body.accessToken), false, 'Token sesi tidak boleh ada di catatan audit.');
    assert.equal(teksAudit.includes('ipHash'), false, 'Hash alamat IP tidak ikut dikirim ke layar audit.');

    // Audit hanya untuk admin.
    assert.equal((await request(baseUrl, '/api/audit', { headers: waliLainHeaders })).status, 403);

    // Header keamanan terpasang di halaman maupun di API, termasuk pada 404.
    const headerHalaman = (await fetch(`${baseUrl}/website/`)).headers;
    assert.equal(headerHalaman.get('x-content-type-options'), 'nosniff');
    assert.equal(headerHalaman.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(headerHalaman.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');
    assert.equal(headerHalaman.get('cross-origin-opener-policy'), 'same-origin');
    assert.match(headerHalaman.get('content-security-policy') || '', /frame-ancestors 'none'/);
    // APP_ENV saat test bukan production, jadi halaman tidak boleh terindeks.
    assert.equal(headerHalaman.get('x-robots-tag'), 'noindex, nofollow');
    assert.equal(headerHalaman.get('strict-transport-security'), null);

    const headerApi = (await fetch(`${baseUrl}/api/health`)).headers;
    assert.equal(headerApi.get('x-content-type-options'), 'nosniff');
    assert.equal(headerApi.get('referrer-policy'), 'strict-origin-when-cross-origin');

    const headerTidakAda = (await fetch(`${baseUrl}/api/endpoint-yang-tidak-ada`)).headers;
    assert.equal(headerTidakAda.get('x-content-type-options'), 'nosniff', 'Header keamanan harus ikut pada 404.');

    // Batas percobaan login benar-benar terpasang, bukan hanya ada modulnya.
    // Email khusus supaya tidak mengganggu login lain di test ini.
    const percobaan = [];
    for (let ke = 0; ke < 6; ke += 1) {
      percobaan.push(await request(baseUrl, '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'penebak@hamasah.test', password: `salah-${ke}` })
      }));
    }
    assert.deepEqual(percobaan.slice(0, 5).map((hasil) => hasil.status), [401, 401, 401, 401, 401]);
    assert.equal(percobaan[5].status, 429, 'Percobaan keenam harus ditolak.');
    assert.equal(percobaan[5].body.error, 'Terlalu banyak percobaan. Silakan coba lagi dalam beberapa menit.');

    const balasanTerkunci = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'penebak@hamasah.test', password: 'salah-lagi' })
    });
    assert.equal(balasanTerkunci.status, 429);
    assert.ok(Number(balasanTerkunci.headers.get('retry-after')) > 0, 'Retry-After harus berisi jumlah detik.');

    // Penguncian terikat pada email, bukan seluruh halaman login: akun lain tetap bisa masuk.
    const tetapBisa = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@hamasah.test', password: 'kata-sandi-admin-aman' })
    });
    assert.equal(tetapBisa.status, 200, 'Akun lain tidak boleh ikut terkunci.');
  } finally {
    await new Promise(function close(resolve) { server.close(resolve); });
    await app.close();
    await database.close();
  }
}

run().then(function done() {
  console.log('server app tests passed');
}).catch(function fail(error) {
  console.error(error);
  process.exitCode = 1;
});
