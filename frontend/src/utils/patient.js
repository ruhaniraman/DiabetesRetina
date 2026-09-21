export const emptyPatient = {
  fullName: '',
  dob: '',
  gender: '',
  bloodGroup: '',
  diabetesDuration: '',
  systolicBP: '',
  diastolicBP: '',
  hba1c: '',
  fastingSugar: '',
};

export function calcAge(dob, today = new Date()) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

export const formatDob = (dob) =>
  dob ? new Date(dob).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
