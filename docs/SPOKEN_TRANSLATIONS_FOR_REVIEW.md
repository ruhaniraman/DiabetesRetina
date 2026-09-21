# Spoken Hindi and Kannada: sentences for review

The **Listen to the result** button reads the result aloud. In English it reads the server's own wording. In Hindi and Kannada it reads the fixed sentences below (`frontend/src/speech/translations.json`), chosen by which result the server produced. **Machine translation is not used for speech**: the machine translator has no Kannada model at all, and its Hindi mistranslated safety-critical sentences (for example "the tool can miss disease" came out as "can remember the disease", and "Right eye" as "correct eye").

**The Hindi and Kannada below are drafts written without a clinician or a medical translator.** Speech in each language is switched OFF until it is marked reviewed:

- Hindi: NOT reviewed (speech off)
- Kannada: NOT reviewed (speech off)

## What to check

1. **Meaning.** Each sentence must say what the English says, no more and no less. Pay closest attention to: "does not rule out disease / can miss disease" (it must not read as reassurance or as "remembers disease"), "referral recommended" (a recommendation, not an order), "URGENT", and left versus right.
2. **Plain words.** People who cannot read will only hear this. Prefer short, everyday words a rural listener uses; keep the medical terms people are likely to hear at the clinic.
3. **Grammar with the blanks.** `{eyes}` is already a full phrase (for example "in the left eye"); `{worst}`, `{threshold}` and `{scores}` are filled in. Read the summary aloud with a blank filled in to check it sounds natural for one eye and for both.
4. **How it sounds.** Listen on a real phone with a real voice; text that reads well can sound wrong (numbers, English medical words, sentence breaks).

## How to switch a language on

Correct the sentences in `frontend/src/speech/translations.json`, have the reviewer sign the table at the end of this sheet, then set that language to `true` under `"reviewed"`, run `python docs/tools/build_translation_review.py` to regenerate this sheet, and update the guard test `test_the_translations_are_flagged_as_unreviewed...` (and its frontend twin in `src/speech/translations.test.js`), which exist so that this cannot happen by accident.

## The sentences

| Where it is used | English (source, matches the server) | Hindi (draft) | Kannada (draft) |
|---|---|---|---|
| Introduction | This is your diabetic retinopathy screening result. | यह आपकी मधुमेह से होने वाली आँख के पर्दे (रेटिना) की बीमारी, यानी डायबिटिक रेटिनोपैथी, की जाँच का नतीजा है। | ಇದು ನಿಮ್ಮ ಮಧುಮೇಹದಿಂದ ಬರುವ ಕಣ್ಣಿನ ರೆಟಿನಾ ಕಾಯಿಲೆ, ಅಂದರೆ ಡಯಾಬಿಟಿಕ್ ರೆಟಿನೋಪತಿಯ, ತಪಾಸಣೆಯ ಫಲಿತಾಂಶ. |
| Announcement that the words are a draft (spoken first while unreviewed) | This is a draft translation that has not been checked by a doctor. If anything is unclear, please ask an eye-care professional. | ये शब्द अभी डॉक्टर ने जाँचे नहीं हैं। कुछ भी समझ न आए तो कृपया किसी नेत्र-विशेषज्ञ से पूछें। | ಈ ಪದಗಳನ್ನು ಇನ್ನೂ ವೈದ್ಯರು ಪರಿಶೀಲಿಸಿಲ್ಲ. ಏನಾದರೂ ಅರ್ಥವಾಗದಿದ್ದರೆ ದಯವಿಟ್ಟು ಕಣ್ಣಿನ ತಜ್ಞರನ್ನು ಕೇಳಿ. |
| Left eye | Left eye | बायीं आँख | ಎಡ ಕಣ್ಣು |
| Right eye | Right eye | दायीं आँख | ಬಲ ಕಣ್ಣು |
| Eye result: referral recommended | Referral recommended. | रेफ़रल की सलाह। | ರೆಫರಲ್ ಮಾಡಲು ಸಲಹೆ. |
| Eye result: no referral flagged | No referral flagged. | रेफ़रल के लिए चिह्नित नहीं। | ರೆಫರಲ್‌ಗೆ ಗುರುತಿಸಿಲ್ಲ. |
| Before a photograph-quality warning | About the photographs: | तस्वीरों के बारे में: | ಚಿತ್ರಗಳ ಬಗ್ಗೆ: |
| Unit after a percentage | % |  प्रतिशत |  ಶೇಕಡಾ |
| Disclaimer, spoken after the summary | This is an automated screening aid, not a diagnosis, and it can miss disease: symptoms or a clinician's concern should always prompt review. | यह एक अपने-आप चलने वाली जाँच सहायक है, बीमारी का निदान नहीं है, और यह बीमारी को पकड़ने से चूक सकती है: कोई लक्षण हो या किसी चिकित्सक को चिंता हो, तो हमेशा आगे जाँच करानी चाहिए। | ಇದು ತಾನಾಗಿ ಕೆಲಸ ಮಾಡುವ ತಪಾಸಣೆ ಸಹಾಯಕ, ರೋಗನಿರ್ಣಯವಲ್ಲ, ಮತ್ತು ಇದು ಕಾಯಿಲೆಯನ್ನು ಗುರುತಿಸದೆ ಇರಬಹುದು: ಯಾವುದೇ ಲಕ್ಷಣಗಳಿದ್ದರೆ ಅಥವಾ ವೈದ್ಯರಿಗೆ ಆತಂಕವಿದ್ದರೆ ಯಾವಾಗಲೂ ಮುಂದಿನ ತಪಾಸಣೆ ಮಾಡಿಸಬೇಕು. |
| 'in the left eye(s)' (fills {eyes}) | left eye | बायीं आँख में | ಎಡ ಕಣ್ಣಿನಲ್ಲಿ |
| 'in the right eye(s)' (fills {eyes}) | right eye | दायीं आँख में | ಬಲ ಕಣ್ಣಿನಲ್ಲಿ |
| 'in the both eye(s)' (fills {eyes}) | left and right eyes | दोनों आँखों में | ಎರಡೂ ಕಣ್ಣುಗಳಲ್ಲಿ |
| Stage label 0 | Stage 0, No DR detected | स्टेज 0, डायबिटिक रेटिनोपैथी के संकेत नहीं मिले | ಹಂತ 0, ಡಯಾಬಿಟಿಕ್ ರೆಟಿನೋಪತಿಯ ಸೂಚನೆಗಳು ಕಂಡುಬಂದಿಲ್ಲ |
| Stage label 1 | Stage 1, Mild | स्टेज 1, हल्की | ಹಂತ 1, ಸೌಮ್ಯ |
| Stage label 2 | Stage 2, Moderate | स्टेज 2, मध्यम | ಹಂತ 2, ಮಧ್ಯಮ |
| Stage label 3 | Stage 3, Severe | स्टेज 3, गंभीर | ಹಂತ 3, ತೀವ್ರ |
| Stage label 4 | Stage 4, Proliferative | स्टेज 4, प्रोलिफ़ेरेटिव | ಹಂತ 4, ಪ್ರೊಲಿಫರೇಟಿವ್ |
| Stage in words: No_DR (fills {worst}) | no retinopathy (Stage 0) | कोई रेटिनोपैथी नहीं (स्टेज 0) | ರೆಟಿನೋಪತಿ ಇಲ್ಲ (ಹಂತ 0) |
| Stage in words: Mild (fills {worst}) | mild retinopathy (Stage 1) | हल्की रेटिनोपैथी (स्टेज 1) | ಸೌಮ್ಯ ರೆಟಿನೋಪತಿ (ಹಂತ 1) |
| Stage in words: Moderate (fills {worst}) | moderate retinopathy (Stage 2) | मध्यम रेटिनोपैथी (स्टेज 2) | ಮಧ್ಯಮ ರೆಟಿನೋಪತಿ (ಹಂತ 2) |
| Stage in words: Severe (fills {worst}) | severe retinopathy (Stage 3) | गंभीर रेटिनोपैथी (स्टेज 3) | ತೀವ್ರ ರೆಟಿನೋಪತಿ (ಹಂತ 3) |
| Stage in words: Proliferate_DR (fills {worst}) | proliferative retinopathy (Stage 4) | प्रोलिफ़ेरेटिव रेटिनोपैथी (स्टेज 4) | ಪ್ರೊಲಿಫರೇಟಿವ್ ರೆಟಿನೋಪತಿ (ಹಂತ 4) |
| Summary: No_DR | The screening model did not detect diabetic retinopathy in either eye. This does not rule out disease, because the screening tool can miss it. Continue regular eye screening as advised by your eye-care professional, and seek review sooner if you notice any change in your vision. | जाँच करने वाले मॉडल को किसी भी आँख में डायबिटिक रेटिनोपैथी के संकेत नहीं मिले। इसका मतलब यह नहीं कि बीमारी बिल्कुल नहीं है, क्योंकि यह जाँच कभी-कभी बीमारी को पकड़ नहीं पाती। अपने नेत्र-विशेषज्ञ की सलाह के अनुसार नियमित रूप से आँखों की जाँच कराते रहें, और अगर आपकी नज़र में कोई भी बदलाव दिखे तो जल्दी जाँच कराएँ। | ತಪಾಸಣೆ ಮಾಡಿದ ಮಾದರಿಗೆ ಯಾವ ಕಣ್ಣಿನಲ್ಲೂ ಡಯಾಬಿಟಿಕ್ ರೆಟಿನೋಪತಿಯ ಸೂಚನೆಗಳು ಕಂಡುಬಂದಿಲ್ಲ. ಇದರರ್ಥ ಕಾಯಿಲೆ ಇಲ್ಲವೇ ಇಲ್ಲ ಎಂದಲ್ಲ, ಏಕೆಂದರೆ ಈ ತಪಾಸಣೆ ಕೆಲವೊಮ್ಮೆ ಕಾಯಿಲೆಯನ್ನು ಗುರುತಿಸದೆ ಇರಬಹುದು. ನಿಮ್ಮ ಕಣ್ಣಿನ ತಜ್ಞರು ಸೂಚಿಸಿದಂತೆ ನಿಯಮಿತವಾಗಿ ಕಣ್ಣಿನ ತಪಾಸಣೆ ಮಾಡಿಸಿಕೊಳ್ಳುತ್ತಿರಿ, ಮತ್ತು ನಿಮ್ಮ ದೃಷ್ಟಿಯಲ್ಲಿ ಯಾವುದೇ ಬದಲಾವಣೆ ಕಂಡರೆ ಬೇಗನೆ ತಪಾಸಣೆ ಮಾಡಿಸಿ. |
| Summary: Mild | The screening model detected signs consistent with mild non-proliferative diabetic retinopathy (Stage 1) in the {eyes}. Follow-up with an eye-care professional is recommended; ask them how often you should be screened. | जाँच करने वाले मॉडल को {eyes} हल्की नॉन-प्रोलिफ़ेरेटिव डायबिटिक रेटिनोपैथी (स्टेज 1) से मेल खाने वाले संकेत मिले। किसी नेत्र-विशेषज्ञ से आगे की जाँच कराने की सलाह दी जाती है; उनसे पूछें कि आपको कितने समय बाद जाँच करानी चाहिए। | ತಪಾಸಣೆ ಮಾಡಿದ ಮಾದರಿಗೆ {eyes} ಸೌಮ್ಯ ನಾನ್-ಪ್ರೊಲಿಫರೇಟಿವ್ ಡಯಾಬಿಟಿಕ್ ರೆಟಿನೋಪತಿಗೆ (ಹಂತ 1) ಹೊಂದುವ ಸೂಚನೆಗಳು ಕಂಡುಬಂದಿವೆ. ಕಣ್ಣಿನ ತಜ್ಞರನ್ನು ಭೇಟಿಯಾಗಿ ಮುಂದಿನ ತಪಾಸಣೆ ಮಾಡಿಸಲು ಸಲಹೆ ನೀಡಲಾಗಿದೆ; ಎಷ್ಟು ಸಮಯಕ್ಕೊಮ್ಮೆ ತಪಾಸಣೆ ಮಾಡಿಸಿಕೊಳ್ಳಬೇಕು ಎಂದು ಅವರನ್ನು ಕೇಳಿ. |
| Summary: Moderate | The screening model detected signs consistent with moderate non-proliferative diabetic retinopathy (Stage 2) in the {eyes}. Referral to an eye specialist is recommended. | जाँच करने वाले मॉडल को {eyes} मध्यम नॉन-प्रोलिफ़ेरेटिव डायबिटिक रेटिनोपैथी (स्टेज 2) से मेल खाने वाले संकेत मिले। किसी नेत्र-विशेषज्ञ को दिखाने की सलाह दी जाती है। | ತಪಾಸಣೆ ಮಾಡಿದ ಮಾದರಿಗೆ {eyes} ಮಧ್ಯಮ ನಾನ್-ಪ್ರೊಲಿಫರೇಟಿವ್ ಡಯಾಬಿಟಿಕ್ ರೆಟಿನೋಪತಿಗೆ (ಹಂತ 2) ಹೊಂದುವ ಸೂಚನೆಗಳು ಕಂಡುಬಂದಿವೆ. ಕಣ್ಣಿನ ತಜ್ಞರಿಗೆ ತೋರಿಸಲು ಸಲಹೆ ನೀಡಲಾಗಿದೆ. |
| Summary: Severe | URGENT: the screening model detected signs consistent with severe non-proliferative diabetic retinopathy (Stage 3) in the {eyes}. Prompt referral to an ophthalmologist is recommended. | ज़रूरी: जाँच करने वाले मॉडल को {eyes} गंभीर नॉन-प्रोलिफ़ेरेटिव डायबिटिक रेटिनोपैथी (स्टेज 3) से मेल खाने वाले संकेत मिले। नेत्र-रोग विशेषज्ञ को जल्द दिखाने की सलाह दी जाती है। | ತುರ್ತು: ತಪಾಸಣೆ ಮಾಡಿದ ಮಾದರಿಗೆ {eyes} ತೀವ್ರ ನಾನ್-ಪ್ರೊಲಿಫರೇಟಿವ್ ಡಯಾಬಿಟಿಕ್ ರೆಟಿನೋಪತಿಗೆ (ಹಂತ 3) ಹೊಂದುವ ಸೂಚನೆಗಳು ಕಂಡುಬಂದಿವೆ. ನೇತ್ರರೋಗ ತಜ್ಞರನ್ನು ಶೀಘ್ರವಾಗಿ ಭೇಟಿಯಾಗಲು ಸಲಹೆ ನೀಡಲಾಗಿದೆ. |
| Summary: Proliferate_DR | URGENT: the screening model detected signs consistent with proliferative diabetic retinopathy (Stage 4) in the {eyes}. Prompt referral to an ophthalmologist is recommended. | ज़रूरी: जाँच करने वाले मॉडल को {eyes} प्रोलिफ़ेरेटिव डायबिटिक रेटिनोपैथी (स्टेज 4) से मेल खाने वाले संकेत मिले। नेत्र-रोग विशेषज्ञ को जल्द दिखाने की सलाह दी जाती है। | ತುರ್ತು: ತಪಾಸಣೆ ಮಾಡಿದ ಮಾದರಿಗೆ {eyes} ಪ್ರೊಲಿಫರೇಟಿವ್ ಡಯಾಬಿಟಿಕ್ ರೆಟಿನೋಪತಿಗೆ (ಹಂತ 4) ಹೊಂದುವ ಸೂಚನೆಗಳು ಕಂಡುಬಂದಿವೆ. ನೇತ್ರರೋಗ ತಜ್ಞರನ್ನು ಶೀಘ್ರವಾಗಿ ಭೇಟಿಯಾಗಲು ಸಲಹೆ ನೀಡಲಾಗಿದೆ. |
| Summary: escalated | The most likely grade was {worst}, but the screening model's referral threshold ({threshold}) was reached in the {eyes} (referral score {scores}). This is treated as referable (Stage 2 or worse) until a clinician reviews it. The exact stage is an estimate; the referral decision is the more reliable result. | सबसे संभावित स्टेज {worst} था, लेकिन जाँच करने वाले मॉडल की रेफ़रल सीमा ({threshold}) {eyes} पार हो गई (रेफ़रल स्कोर {scores})। जब तक कोई चिकित्सक इसकी समीक्षा न करे, इसे रेफ़र करने योग्य (स्टेज 2 या उससे ऊपर) माना जाता है। सटीक स्टेज सिर्फ़ एक अनुमान है; रेफ़रल का फ़ैसला ज़्यादा भरोसेमंद नतीजा है। | ಅತ್ಯಂತ ಸಂಭವನೀಯ ಹಂತ {worst} ಆಗಿತ್ತು, ಆದರೆ ತಪಾಸಣೆ ಮಾದರಿಯ ರೆಫರಲ್ ಮಿತಿ ({threshold}) {eyes} ತಲುಪಿದೆ (ರೆಫರಲ್ ಸ್ಕೋರ್ {scores}). ವೈದ್ಯರು ಪರಿಶೀಲಿಸುವವರೆಗೆ ಇದನ್ನು ರೆಫರ್ ಮಾಡಬೇಕಾದ (ಹಂತ 2 ಅಥವಾ ಹೆಚ್ಚಿನ) ಪ್ರಕರಣ ಎಂದು ಪರಿಗಣಿಸಲಾಗುತ್ತದೆ. ನಿಖರವಾದ ಹಂತ ಒಂದು ಅಂದಾಜು ಮಾತ್ರ; ರೆಫರಲ್ ನಿರ್ಧಾರ ಹೆಚ್ಚು ನಂಬಲರ್ಹ ಫಲಿತಾಂಶ. |
| Photograph warning: blur_warn | Image is slightly soft; results may be less reliable. | तस्वीर थोड़ी धुंधली है; नतीजे कम भरोसेमंद हो सकते हैं। | ಚಿತ್ರ ಸ್ವಲ್ಪ ಮಸುಕಾಗಿದೆ; ಫಲಿತಾಂಶಗಳು ಕಡಿಮೆ ನಂಬಲರ್ಹವಾಗಿರಬಹುದು. |
| Photograph warning: dark_warn | Image is dark; results may be less reliable. | तस्वीर अँधेरी है; नतीजे कम भरोसेमंद हो सकते हैं। | ಚಿತ್ರ ಕತ್ತಲಾಗಿದೆ; ಫಲಿತಾಂಶಗಳು ಕಡಿಮೆ ನಂಬಲರ್ಹವಾಗಿರಬಹುದು. |
| Photograph warning: bright_warn | Image is very bright; results may be less reliable. | तस्वीर बहुत चमकीली है; नतीजे कम भरोसेमंद हो सकते हैं। | ಚಿತ್ರ ತುಂಬಾ ಪ್ರಕಾಶಮಾನವಾಗಿದೆ; ಫಲಿತಾಂಶಗಳು ಕಡಿಮೆ ನಂಬಲರ್ಹವಾಗಿರಬಹುದು. |
| Photograph warning: colour_warn | Image has an unusual colour balance for a retinal photograph; results may be less reliable. Check that it is a fundus photograph. | आँख के पर्दे की तस्वीर के लिए इसके रंग सामान्य नहीं हैं; नतीजे कम भरोसेमंद हो सकते हैं। जाँच लें कि यह आँख के भीतरी हिस्से (फ़ंडस) की तस्वीर है। | ರೆಟಿನಾ ಚಿತ್ರಕ್ಕೆ ಈ ಚಿತ್ರದ ಬಣ್ಣ ಸಾಮಾನ್ಯವಾಗಿಲ್ಲ; ಫಲಿತಾಂಶಗಳು ಕಡಿಮೆ ನಂಬಲರ್ಹವಾಗಿರಬಹುದು. ಇದು ಕಣ್ಣಿನ ಒಳಭಾಗದ (ಫಂಡಸ್) ಚಿತ್ರವೇ ಎಂದು ಪರಿಶೀಲಿಸಿ. |
| Photograph warning: disc_warn | Image may not show the optic disc clearly. Make sure the photograph is centred on the optic disc and macula; results may be less reliable. | तस्वीर में ऑप्टिक डिस्क साफ़ दिखाई नहीं दे रही हो सकती है। ध्यान रखें कि तस्वीर ऑप्टिक डिस्क और मैक्युला पर केंद्रित हो; नतीजे कम भरोसेमंद हो सकते हैं। | ಚಿತ್ರದಲ್ಲಿ ಆಪ್ಟಿಕ್ ಡಿಸ್ಕ್ ಸ್ಪಷ್ಟವಾಗಿ ಕಾಣಿಸದೇ ಇರಬಹುದು. ಚಿತ್ರವು ಆಪ್ಟಿಕ್ ಡಿಸ್ಕ್ ಮತ್ತು ಮ್ಯಾಕುಲಾ ಮೇಲೆ ಕೇಂದ್ರೀಕೃತವಾಗಿರುವಂತೆ ನೋಡಿಕೊಳ್ಳಿ; ಫಲಿತಾಂಶಗಳು ಕಡಿಮೆ ನಂಬಲರ್ಹವಾಗಿರಬಹುದು. |

Numbers are written as digits plus the unit above (for example "20 प्रतिशत"); the phone's voice reads the digits.

## Sign-off

| Language | Reviewer name and qualification | Date | Corrections made in translations.json? | Switched on by |
|---|---|---|---|---|
| Hindi | | | | |
| Kannada | | | | |

A signature here means the reviewer has read every sentence above for that language. It does not clinically validate the screening tool.
