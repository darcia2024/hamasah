const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHamasahApp } = require('./app.js');

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
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'hamasah-api-'));
  const app = createHamasahApp({
    rootDirectory: path.resolve(__dirname, '..'),
    dataDirectory: temporaryDirectory,
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
    const invoice = await request(baseUrl, '/api/operations/invoices', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ studentId, description: 'SPP September', amount: 1500000 })
    });
    assert.equal(invoice.status, 201);
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
    assert.equal(accounts.body.items.length, 4);

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
    const denied = await request(baseUrl, `/api/registrations/${registrationId}`);
    assert.equal(denied.status, 401);

    const candidateHeaders = { Authorization: `Bearer ${created.body.accessToken}`, 'Content-Type': 'application/json' };
    const retrieved = await request(baseUrl, `/api/registrations/${registrationId}`, { headers: candidateHeaders });
    assert.equal(retrieved.status, 200);
    assert.equal(retrieved.body.registration.status, 'submitted');

    const documentAdded = await request(baseUrl, `/api/registrations/${registrationId}/documents`, {
      method: 'POST',
      headers: candidateHeaders,
      body: JSON.stringify({ type: 'passport', storageKey: `registrations/${registrationId}/passport.pdf` })
    });
    assert.equal(documentAdded.status, 201);
    assert.equal(documentAdded.body.registration.documentSummary.length, 1);
    assert.equal('storageKey' in documentAdded.body.registration.documentSummary[0], false);

    const changed = await request(baseUrl, `/api/registrations/${registrationId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${createdOfficerLogin.body.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'document-review', note: 'Berkas mulai diperiksa.' })
    });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.registration.status, 'document-review');
    const registrationList = await request(baseUrl, '/api/registrations', {
      headers: { Authorization: `Bearer ${createdOfficerLogin.body.accessToken}` }
    });
    assert.equal(registrationList.status, 200);
    assert.equal(registrationList.body.items.length, 1);
    assert.equal(registrationList.body.items[0].applicant.applicantName, 'Naufal Rizki');

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
    assert.match(staffPage.body, /Konsol operasional/);
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
  } finally {
    await new Promise(function close(resolve) { server.close(resolve); });
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

run().then(function done() {
  console.log('server app tests passed');
}).catch(function fail(error) {
  console.error(error);
  process.exitCode = 1;
});
