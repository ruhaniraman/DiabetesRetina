import { useTranslation } from 'react-i18next';

// The servers (and the form checks) answer in English. Where the app knows the exact sentence, it is shown in the chosen language instead;
// any other text (an unexpected server error) is shown as it came, in English, rather than guessed at.
// Keep the sentences here identical to the ones in auth-server/index.js, backend/quality.py and utils/validation.js.
const MESSAGE_KEYS = {
  'Cannot reach the server. Check that the backend is running.': 'msg.noServer',
  'Cannot reach the analysis server. Check that the backend is running.': 'msg.noAnalysis',
  'Something went wrong. Please try again.': 'msg.generic',
  'Something went wrong on the server.': 'msg.serverError',
  'Your saved profile could not be read.': 'msg.profileUnreadable',
  'Please verify your email to continue.': 'msg.verifyFirst',
  'A new code has been sent.': 'msg.newCodeSent',
  'An account with this email already exists.': 'msg.accountExists',
  'If an account exists for that email, a reset code has been sent.': 'msg.resetSent',
  'If that account is awaiting verification, a new code has been sent.': 'msg.verifySent',
  'Invalid or expired code. Request a new one.': 'msg.invalidCode',
  'That code has expired. Request a new one.': 'msg.codeExpired',
  'Too many incorrect attempts. Request a new code.': 'msg.tooManyCodeTries',
  'Password updated. Please sign in with your new password.': 'msg.passwordUpdated',
  'Too many attempts. Please try again in a few minutes.': 'msg.tooManyAttempts',
  'Enter your email and password.': 'msg.enterEmailPassword',
  'Enter your password to delete your account.': 'msg.enterPasswordDelete',
  'Please fix the highlighted fields.': 'msg.fixFields',
  'Incorrect email or password.': 'msg.badLogin',
  'Not signed in.': 'msg.notSignedIn',
  'Session expired. Please sign in again.': 'msg.sessionExpired',
  'Incorrect password.': 'msg.badPassword',
  'Exam not found.': 'msg.examNotFound',
  'This email is already verified. Please sign in.': 'msg.alreadyVerified',
  'Full name is required.': 'msg.nameRequired',
  'Enter your full name.': 'msg.nameShort',
  'Email is required.': 'msg.emailRequired',
  'Enter a valid email address.': 'msg.emailInvalid',
  'Enter the 6-digit code from your email.': 'msg.code6',
  'Password is required.': 'msg.passwordRequired',
  'Password is too long (72 characters max).': 'msg.passwordLong',
  'Please confirm your password.': 'msg.confirmRequired',
  'Passwords do not match.': 'msg.noMatch',
  'Password needs: at least 8 characters.': 'msg.needLength',
  'Password needs: one uppercase letter.': 'msg.needUpper',
  'Password needs: one lowercase letter.': 'msg.needLower',
  'Password needs: one number.': 'msg.needNumber',
  'At least 8 characters': 'msg.ruleLength',
  'One uppercase letter': 'msg.ruleUpper',
  'One lowercase letter': 'msg.ruleLower',
  'One number': 'msg.ruleNumber',
  'No retina could be found in this image. Please upload a fundus photograph.': 'msg.no_retina',
  'Image rejected: too blurry for a reliable assessment. Please retake the photo.': 'msg.blur_reject',
  'Image rejected: too dark for a reliable assessment. Please retake the photo with better illumination.': 'msg.dark_reject',
  'Image rejected: overexposed. Please retake the photo.': 'msg.bright_reject',
  'Image rejected: it looks grainy or heavily compressed. Please retake the photo or upload the original file.': 'msg.noise_reject',
  'Image rejected: this does not look like a colour retinal photograph. Please upload a colour fundus photograph.': 'msg.not_colour_reject',
  'Image rejected: only part of the retina is visible. Please retake the photo with the whole retina in the frame.': 'msg.partial_reject',
  'Image has an unusual colour balance for a retinal photograph; results may be less reliable. Check that it is a fundus photograph.': 'msg.colour_warn',
  'Image rejected: the left and right photos are the same picture. Please upload a separate photo for each eye.': 'msg.same_picture',
  'Image may not show the optic disc clearly. Make sure the photograph is centred on the optic disc and macula; results may be less reliable.': 'msg.disc_warn',
  'Image is slightly soft; results may be less reliable.': 'msg.blur_warn',
  'Image is dark; results may be less reliable.': 'msg.dark_warn',
  'Image is very bright; results may be less reliable.': 'msg.bright_warn',
};

// Sentences with a number in them.
const MESSAGE_PATTERNS = [[/^Please wait (\d+)s before requesting another code\.$/, 'msg.waitCode']];

/** The text for a known English message in the current language; anything unknown comes back unchanged. */
export function localizeMessage(t, text) {
  if (!text || typeof text !== 'string') return text;
  const key = MESSAGE_KEYS[text];
  if (key) return t(key);
  for (const [pattern, patternKey] of MESSAGE_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return t(patternKey, { n: match[1] });
  }
  return text;
}

/** "Stage 2 - Moderate" (as the server writes it) in the current language; unknown labels come back unchanged. */
export function localizeGrade(t, label) {
  const n = /^Stage ([0-4])\b/.exec(String(label || ''))?.[1];
  return n === undefined ? label : t(`grade.${n}`);
}

/** Just the stage: "Stage 2". */
export function localizeStage(t, label) {
  const n = /^Stage ([0-4])\b/.exec(String(label || ''))?.[1];
  return n === undefined ? label : t('grade.stage', { n });
}

/** Bound helpers for components: `const { tm, grade, stage } = useMessages()`. */
export function useMessages() {
  const { t } = useTranslation();
  return {
    tm: (text) => localizeMessage(t, text),
    grade: (label) => localizeGrade(t, label),
    stage: (label) => localizeStage(t, label),
  };
}
