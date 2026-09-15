const guard = document.querySelector('#lms-guard');
const guardCopy = document.querySelector('#lms-guard-copy');
const consoleSection = document.querySelector('#lms-console');
const studentSelect = document.querySelector('#lms-student-select');
const status = document.querySelector('#lms-status');
const courseList = document.querySelector('#lms-course-list');
const courseView = document.querySelector('#lms-course-view');
const staffSection = document.querySelector('#lms-staff-section');
const courseForm = document.querySelector('#course-form');
const courseStatus = document.querySelector('#course-form-status');
const materialForm = document.querySelector('#material-form');
const materialStatus = document.querySelector('#material-form-status');
const materialCourse = document.querySelector('#material-course');
const enrollmentForm = document.querySelector('#enrollment-form');
const enrollmentStatus = document.querySelector('#enrollment-form-status');
const enrollmentCourse = document.querySelector('#enrollment-course');
let role = null;

function session() { try { return JSON.parse(sessionStorage.getItem('hamasahPortalSession') || 'null'); } catch { return null; } }
function headers() { const current = session(); return current ? { Authorization: `Bearer ${current.accessToken}` } : {}; }
function setStatus(target, message, error) { target.textContent = message; target.classList.toggle('is-error', Boolean(error)); }

function renderCourse(course) {
  const title = document.createElement('h2'); title.textContent = course.title;
  const description = document.createElement('p'); description.textContent = `${course.description} · Progress ${course.progress}%`;
  const list = document.createElement('div'); list.className = 'portal-account-list';
  course.materials.forEach((material) => {
    const item = document.createElement('div'); item.className = 'portal-account';
    const heading = document.createElement('strong'); heading.textContent = `${material.title} · ${material.type}`;
    const summary = document.createElement('span'); summary.textContent = material.summary;
    const action = document.createElement('button'); action.type = 'button'; action.className = 'button button--secondary'; action.textContent = material.completed ? 'Selesai dipelajari' : 'Tandai selesai';
    action.disabled = material.completed;
    action.addEventListener('click', () => completeMaterial(course.id, material.id));
    const helpForm = document.createElement('form'); helpForm.className = 'lms-help-form';
    const question = document.createElement('input'); question.type = 'text'; question.placeholder = 'Tanyakan materi ini';
    const ask = document.createElement('button'); ask.type = 'submit'; ask.className = 'button button--primary'; ask.textContent = 'Tanya';
    const answer = document.createElement('p'); answer.className = 'lms-answer';
    helpForm.append(question, ask);
    helpForm.addEventListener('submit', (event) => { event.preventDefault(); studyHelp(course.id, material.id, question.value, answer); });
    item.append(heading, summary, action, helpForm, answer); list.append(item);
  });
  courseView.replaceChildren(title, description, list); courseView.hidden = false;
}

async function completeMaterial(courseId, materialId) {
  const response = await fetch(`/api/students/${encodeURIComponent(studentSelect.value)}/courses/${encodeURIComponent(courseId)}/materials/${encodeURIComponent(materialId)}/complete`, { method: 'POST', headers: headers() });
  const result = await response.json(); if (!response.ok) { setStatus(status, result.error || 'Progress belum dapat diperbarui.', true); return; }
  renderCourse(result.course); await loadCourses();
}

async function studyHelp(courseId, materialId, question, answer) {
  const response = await fetch(`/api/students/${encodeURIComponent(studentSelect.value)}/courses/${encodeURIComponent(courseId)}/materials/${encodeURIComponent(materialId)}/study-help`, { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
  const result = await response.json(); answer.textContent = response.ok ? `${result.help.answer} (${result.help.source})` : result.error || 'Jawaban belum tersedia.';
}

function renderCourses(courses) {
  courseList.replaceChildren(); courseView.hidden = true;
  if (!courses.length) { const empty = document.createElement('p'); empty.textContent = 'Belum ada maddah yang diikuti.'; courseList.append(empty); return; }
  courses.forEach((course) => {
    const item = document.createElement('article'); item.className = 'portal-student-card';
    const title = document.createElement('h3'); title.textContent = course.title;
    const copy = document.createElement('p'); copy.textContent = `${course.materials.length} materi · Progress ${course.progress}%`;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'button button--secondary'; button.textContent = 'Buka maddah'; button.addEventListener('click', () => renderCourse(course));
    item.append(title, copy, button); courseList.append(item);
  });
}

async function loadCourses() {
  if (!studentSelect.value) { courseList.replaceChildren(); courseView.hidden = true; return; }
  const response = await fetch(`/api/students/${encodeURIComponent(studentSelect.value)}/courses`, { headers: headers() });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Maddah belum dapat dimuat.');
  renderCourses(result.items); setStatus(status, `${result.items.length} maddah tersedia.`);
}

function renderStaffCourses(courses) {
  [materialCourse, enrollmentCourse].forEach((select) => select.replaceChildren());
  courses.forEach((course) => [materialCourse, enrollmentCourse].forEach((select) => select.add(new Option(course.title, course.id))));
}

async function loadStaffCourses() {
  if (!['admin', 'supervisor'].includes(role)) return;
  const response = await fetch('/api/courses', { headers: headers() });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Daftar maddah belum dapat dimuat.');
  renderStaffCourses(result.items);
}

async function loadStudents() {
  const response = await fetch('/api/my-students', { headers: headers() });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Data santri belum dapat dimuat.');
  studentSelect.replaceChildren(new Option('Pilih santri', ''));
  result.items.forEach((student) => studentSelect.add(new Option(`${student.name} · ${student.program}`, student.id)));
  if (result.items.length === 1) { studentSelect.value = result.items[0].id; await loadCourses(); }
}

studentSelect.addEventListener('change', () => loadCourses().catch((error) => setStatus(status, error.message, true)));
courseForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try { const response = await fetch('/api/courses', { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ title: document.querySelector('#course-title').value, description: document.querySelector('#course-description').value }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); courseForm.reset(); setStatus(courseStatus, `Maddah ${result.course.title} berhasil dibuat.`); await loadStaffCourses(); } catch (error) { setStatus(courseStatus, error.message || 'Maddah belum dapat dibuat.', true); }
});
materialForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const guideQuestion = document.querySelector('#guide-question').value.trim(); const guideAnswer = document.querySelector('#guide-answer').value.trim();
  try { const response = await fetch(`/api/courses/${encodeURIComponent(materialCourse.value)}/materials`, { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ type: document.querySelector('#material-type').value, title: document.querySelector('#material-title').value, content: document.querySelector('#material-content').value, summary: document.querySelector('#material-summary').value, keyPoints: document.querySelector('#material-points').value.split(',').map((entry) => entry.trim()).filter(Boolean), studyGuide: guideQuestion && guideAnswer ? [{ question: guideQuestion, answer: guideAnswer }] : [] }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); materialForm.reset(); setStatus(materialStatus, `Materi ${result.material.title} berhasil ditambahkan.`); if (studentSelect.value) await loadCourses(); } catch (error) { setStatus(materialStatus, error.message || 'Materi belum dapat ditambahkan.', true); }
});
enrollmentForm.addEventListener('submit', async (event) => {
  event.preventDefault(); if (!studentSelect.value) { setStatus(enrollmentStatus, 'Pilih santri terlebih dahulu.', true); return; }
  try { const response = await fetch(`/api/students/${encodeURIComponent(studentSelect.value)}/courses/${encodeURIComponent(enrollmentCourse.value)}`, { method: 'POST', headers: headers() }); if (!response.ok) { const result = await response.json(); throw new Error(result.error); } setStatus(enrollmentStatus, 'Santri berhasil didaftarkan ke maddah.'); await loadCourses(); } catch (error) { setStatus(enrollmentStatus, error.message || 'Enrollment belum dapat disimpan.', true); }
});

(async function initialize() {
  try { const response = await fetch('/api/me', { headers: headers() }); const result = await response.json(); if (!response.ok || !['admin', 'supervisor', 'student'].includes(result.account.role)) throw new Error('Halaman ini hanya tersedia untuk santri, pengawas, atau admin.'); role = result.account.role; guard.hidden = true; consoleSection.hidden = false; if (['admin', 'supervisor'].includes(role)) { staffSection.hidden = false; await loadStaffCourses(); } await loadStudents(); } catch (error) { guardCopy.textContent = error.message || 'Silakan masuk melalui Portal Hamasah.'; }
}());
