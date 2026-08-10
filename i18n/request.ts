import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

type Messages = Record<string, unknown>;

/** Deep-merge locale messages over English so missing keys fall back to EN. */
function deepMergeMessages(fallback: Messages, locale: Messages): Messages {
    const result: Messages = { ...fallback };

    for (const key of Object.keys(locale)) {
        const localeValue = locale[key];
        const fallbackValue = fallback[key];

        if (
            localeValue !== null &&
            typeof localeValue === 'object' &&
            !Array.isArray(localeValue) &&
            fallbackValue !== null &&
            typeof fallbackValue === 'object' &&
            !Array.isArray(fallbackValue)
        ) {
            result[key] = deepMergeMessages(
                fallbackValue as Messages,
                localeValue as Messages
            );
        } else {
            result[key] = localeValue;
        }
    }

    return result;
}

export default getRequestConfig(async ({ requestLocale }) => {
    // This typically corresponds to the `[locale]` segment
    let locale = await requestLocale;

    // Ensure that a valid locale is used
    if (!locale || !routing.locales.includes(locale as any)) {
        locale = routing.defaultLocale;
    }

    const localeMessages = (await import(`./translations/${locale}.json`)).default;

    // Use English as fallback for any keys missing in the selected locale
    if (locale === routing.defaultLocale) {
        return {
            locale,
            messages: localeMessages,
        };
    }

    const enMessages = (await import(`./translations/en.json`)).default;

    return {
        locale,
        messages: deepMergeMessages(enMessages, localeMessages),
    };
});
