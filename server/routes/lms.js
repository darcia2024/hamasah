const { json, noContent, publicError } = require('../http/respond.js');

module.exports = [
  {
    method: 'POST',
    pattern: /^\/api\/courses$/,
    permission: 'courses.manage',
    async handler({ response, services, auth, readBody }) {
      const created = await services.lmsService.createCourse(await readBody(), await auth.actor());
      json(response, created.ok ? 201 : 422, created.ok ? { course: created.value } : publicError(created));
    }
  },

  {
    method: 'GET',
    pattern: /^\/api\/courses$/,
    permission: 'courses.manage',
    async handler({ response, services, auth }) {
      const courses = await services.lmsService.listCourses(await auth.actor());
      json(response, courses.ok ? 200 : 403, courses.ok ? { items: courses.value } : publicError(courses));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/courses\/([\w-]+)\/materials$/,
    permission: 'courses.manage',
    async handler({ response, services, auth, params, readBody }) {
      const created = await services.lmsService.addMaterial(params[0], await readBody(), await auth.actor());
      json(response, created.ok ? 201 : 422, created.ok ? { material: created.value } : publicError(created));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/students\/([\w-]+)\/courses\/([\w-]+)$/,
    permission: 'courses.manage',
    async handler({ response, services, auth, params }) {
      const enrolled = await services.lmsService.enroll(params[0], params[1], await auth.actor());
      if (enrolled.ok) {
        noContent(response);
        return;
      }
      json(response, 422, publicError(enrolled));
    }
  },

  {
    method: 'GET',
    pattern: /^\/api\/students\/([\w-]+)\/courses$/,
    permission: 'courses.read',
    async handler({ response, services, auth, params }) {
      const courses = await services.lmsService.listStudentCourses(params[0], await auth.actor());
      json(response, courses.ok ? 200 : 403, courses.ok ? { items: courses.value } : publicError(courses));
    }
  },

  {
    method: 'GET',
    pattern: /^\/api\/students\/([\w-]+)\/courses\/([\w-]+)$/,
    permission: 'courses.read',
    async handler({ response, services, auth, params }) {
      const course = await services.lmsService.getStudentCourse(params[0], params[1], await auth.actor());
      json(response, course.ok ? 200 : 403, course.ok ? { course: course.value } : publicError(course));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/students\/([\w-]+)\/courses\/([\w-]+)\/materials\/([\w-]+)\/complete$/,
    permission: 'courses.read',
    async handler({ response, services, auth, params }) {
      const completed = await services.lmsService.completeMaterial(params[0], params[1], params[2], await auth.actor());
      json(response, completed.ok ? 200 : 422, completed.ok ? { course: completed.value } : publicError(completed));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/students\/([\w-]+)\/courses\/([\w-]+)\/materials\/([\w-]+)\/study-help$/,
    permission: 'courses.read',
    async handler({ response, services, auth, params, readBody }) {
      const body = await readBody();
      const help = await services.lmsService.studyHelp(params[0], params[1], params[2], body.question, await auth.actor());
      json(response, help.ok ? 200 : 422, help.ok ? { help: help.value } : publicError(help));
    }
  }
  ,{
    method: 'POST',
    pattern: /^\/api\/students\/([\w-]+)\/courses\/([\w-]+)\/materials\/([\w-]+)\/attempts$/,
    permission: 'courses.read',
    async handler({ response, services, auth, params, readBody }) {
      const body = await readBody();
      const result = await services.lmsService.submitQuiz(params[0], params[1], params[2], body.answers, await auth.actor());
      json(response, result.ok ? 200 : 422, result.ok ? { attempt: result.value.attempt, course: result.value.course.value } : publicError(result));
    }
  }
];
