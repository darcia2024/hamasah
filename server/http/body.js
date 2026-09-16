// Pembacaan isi permintaan JSON, dengan batas ukuran.

const MAX_REQUEST_BODY_BYTES = 100000;
const ABSOLUTE_REQUEST_BODY_LIMIT_BYTES = 5000000;

// Error dengan status HTTP-nya sendiri, supaya status tidak perlu ditebak dari isi pesan.
class RequestBodyError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'RequestBodyError';
    this.status = status;
  }
}

function readJsonBody(request) {
  return new Promise(function resolveBody(resolve, reject) {
    let body = '';
    let received = 0;
    let tooLarge = false;

    request.on('data', function receiveChunk(chunk) {
      received += chunk.length;
      if (!tooLarge && received > MAX_REQUEST_BODY_BYTES) {
        // Isi dibuang, tetapi pembacaan diteruskan sampai selesai supaya pengirim
        // menerima balasan 413. Kiriman yang sangat besar tetap diputus.
        tooLarge = true;
        body = '';
      }
      if (tooLarge) {
        if (received > ABSOLUTE_REQUEST_BODY_LIMIT_BYTES) {
          request.destroy();
          reject(new RequestBodyError('Ukuran permintaan terlalu besar.', 413));
        }
        return;
      }
      body += chunk;
    });

    request.on('end', function parseBody() {
      if (tooLarge) {
        reject(new RequestBodyError('Ukuran permintaan terlalu besar.', 413));
        return;
      }
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new RequestBodyError('Isi permintaan harus berupa JSON yang valid.', 400));
      }
    });

    request.on('error', reject);
  });
}

module.exports = {
  ABSOLUTE_REQUEST_BODY_LIMIT_BYTES,
  MAX_REQUEST_BODY_BYTES,
  RequestBodyError,
  readJsonBody
};
