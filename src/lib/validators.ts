export function validatePKMobile(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (!digits) return 'Mobile number is required';
  if (digits.length < 10) return 'Enter a valid mobile number';
  return null;
}