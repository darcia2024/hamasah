// Versi kebijakan ditulis dari konstanta yang sama dengan yang disimpan server pada
// setiap pendaftaran, bukan diketik ulang di HTML. Kalau angkanya diketik dua kali,
// cepat atau lambat keduanya berbeda, dan catatan persetujuan kehilangan artinya.

(function tampilkanVersiKebijakan() {
  const target = document.querySelector('#policy-version-value');
  if (!target) return;

  const domain = globalThis.HamasahRegistrationDomain;
  target.textContent = domain && domain.PRIVACY_POLICY_VERSION
    ? domain.PRIVACY_POLICY_VERSION
    : 'tidak dapat dibaca';
})();
