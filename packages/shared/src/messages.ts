/**
 * Server error messages in English and Tamil. The API returns `{ key, params }`
 * alongside an English `message`; clients render the message in the user's language.
 * `ta` is typed against `en` so a missing translation is a compile error.
 */
export const LANGUAGES = ['en', 'ta'] as const;
export type Lang = (typeof LANGUAGES)[number];

const en = {
  // generic
  'error.notFound': '{entity} not found',
  'error.forbidden': 'You do not have permission to perform this action',
  'error.validation': 'Please check the highlighted fields',
  'error.rateLimited': 'Too many requests, please slow down',
  'error.internal': 'Something went wrong. Please try again.',
  'error.duplicate': 'A record with these details already exists',
  'error.badRequest': 'Invalid request',
  // entities
  'entity.table': 'Table', 'entity.orderItem': 'Order item', 'entity.menuItem': 'Menu item', 'entity.outlet': 'Outlet',
  'entity.order': 'Order', 'entity.inventoryItem': 'Inventory item', 'entity.category': 'Category', 'entity.area': 'Area',
  'entity.reservation': 'Reservation', 'entity.user': 'User', 'entity.payment': 'Payment', 'entity.route': 'Page',
  // auth
  'auth.required': 'Please sign in to continue',
  'auth.invalidToken': 'Your session has expired. Please sign in again.',
  'auth.disabled': 'This account is disabled',
  'auth.invalidCredentials': 'Invalid email or password',
  'auth.locked': 'Too many failed attempts. Try again in 15 minutes.',
  'auth.noRefresh': 'Please sign in to continue',
  'auth.refreshInvalid': 'Your session has expired. Please sign in again.',
  'auth.refreshReuse': 'For your security you have been signed out. Please sign in again.',
  'auth.refreshRotated': 'Session was just refreshed in another tab; please retry',
  'auth.wrongPassword': 'Current password is incorrect',
  'auth.signupDisabled': 'Self-service signup is disabled',
  'auth.emailExists': 'An account with this email already exists',
  // staff
  'staff.cannotModify': 'You cannot modify this user',
  'staff.cannotAssignRole': 'You cannot assign the {role} role',
  'staff.cannotAssignOutlet': 'You cannot assign staff to that outlet',
  'staff.notAssigned': 'You are not assigned to this outlet',
  'staff.selfChange': 'You cannot change your own role or deactivate yourself',
  // floor
  'table.exists': 'Table {table} already exists',
  'table.hasOpenOrder': 'Table {table} already has an open order',
  'table.thisHasOpenOrder': 'This table has an open order',
  'table.outOfService': 'Table {table} is out of service',
  'table.closeOrderFirst': 'Close the open order on this table first',
  'table.tooSmall': 'Table {table} seats only {seats}',
  'table.booked': 'Table {table} is already booked for that time',
  'area.hasTables': 'Move or remove the tables in this area first',
  'area.hasHistory': 'This area has tables with order history and cannot be deleted',
  // menu
  'menu.categoryHasItems': 'Move or archive the items in this category first',
  'menu.itemUnavailable': '{item} is currently unavailable',
  'menu.itemsGone': 'One or more menu items no longer exist',
  'menu.unknownModifier': 'Unknown option "{modifier}" for {item}',
  'menu.availabilityBoolean': 'isAvailable must be true or false',
  'recipe.unknownIngredient': 'Unknown inventory item in recipe',
  'recipe.duplicate': 'Duplicate ingredient in recipe',
  'inventory.exists': '{name} already exists',
  // orders
  'order.notOpen': 'This order is already {status}',
  'order.noNewItems': 'There are no new items to send',
  'order.itemSent': 'Items already sent to the kitchen cannot be changed; void instead',
  'order.itemVoided': 'Item is already voided',
  'order.voidNeedsManager': 'Voiding a sent item requires manager approval',
  'order.voidBelowPaid': 'Cannot void below the amount already paid; refund first',
  'order.onlyDineInMove': 'Only dine-in orders can be moved between tables',
  'order.discountLimit': 'Discounts above 20% require a manager',
  'order.discountBelowPaid': 'Discount would bring the total below the amount already paid',
  'order.refundFirst': 'Refund payments before cancelling this order',
  'order.onlyReadyServed': 'Only items that are ready can be marked served',
  'order.badTransition': 'Cannot move item from {from} to {to}',
  'order.concurrentUpdate': 'Item was updated by someone else; refresh and retry',
  'payment.unsentItems': 'Send or remove unsent items before taking payment',
  'payment.nothingDue': 'Nothing left to pay on this order',
  'payment.exceedsBalance': 'Amount exceeds the balance due ({balance})',
  'payment.idempotencyReused': 'This payment reference was already used for another order',
  'payment.alreadyRefunded': 'Payment already refunded',
  // licensing / setup
  'license.expired': 'The licence or trial has expired. New orders are paused — please contact your vendor to renew.',
  'license.invalid': 'This licence key is not valid',
  'license.outletLimit': 'Your licence allows {max} branch(es). Upgrade to add more.',
  'license.onpremOnly': 'Licence keys are only used on on-premise installations',
  'system.notAvailable': 'This feature is not available on this installation',
  'setup.alreadyDone': 'Setup has already been completed on this installation',
  // reservations
  'reservation.onlyBookedEditable': 'Only booked reservations can be edited',
  'reservation.badTransition': 'Cannot change reservation from {from} to {to}',
} as const;

export type MessageKey = keyof typeof en;

const ta: Record<MessageKey, string> = {
  'error.notFound': '{entity} கிடைக்கவில்லை',
  'error.forbidden': 'இந்தச் செயலைச் செய்ய உங்களுக்கு அனுமதி இல்லை',
  'error.validation': 'குறிக்கப்பட்ட விவரங்களைச் சரிபார்க்கவும்',
  'error.rateLimited': 'அதிகமான கோரிக்கைகள். சற்று நேரம் கழித்து முயற்சிக்கவும்',
  'error.internal': 'ஏதோ தவறு நடந்துவிட்டது. மீண்டும் முயற்சிக்கவும்.',
  'error.duplicate': 'இதே விவரங்களுடன் ஒரு பதிவு ஏற்கனவே உள்ளது',
  'error.badRequest': 'தவறான கோரிக்கை',
  'entity.table': 'மேசை', 'entity.orderItem': 'ஆர்டர் பொருள்', 'entity.menuItem': 'மெனு உணவு', 'entity.outlet': 'கிளை',
  'entity.order': 'ஆர்டர்', 'entity.inventoryItem': 'சரக்கு பொருள்', 'entity.category': 'வகை', 'entity.area': 'பகுதி',
  'entity.reservation': 'முன்பதிவு', 'entity.user': 'பயனர்', 'entity.payment': 'கட்டணம்', 'entity.route': 'பக்கம்',
  'auth.required': 'தொடர உள்நுழையவும்',
  'auth.invalidToken': 'உங்கள் அமர்வு காலாவதியாகிவிட்டது. மீண்டும் உள்நுழையவும்.',
  'auth.disabled': 'இந்தக் கணக்கு முடக்கப்பட்டுள்ளது',
  'auth.invalidCredentials': 'மின்னஞ்சல் அல்லது கடவுச்சொல் தவறு',
  'auth.locked': 'பலமுறை தவறான முயற்சிகள். 15 நிமிடங்கள் கழித்து முயற்சிக்கவும்.',
  'auth.noRefresh': 'தொடர உள்நுழையவும்',
  'auth.refreshInvalid': 'உங்கள் அமர்வு காலாவதியாகிவிட்டது. மீண்டும் உள்நுழையவும்.',
  'auth.refreshReuse': 'பாதுகாப்பு காரணமாக நீங்கள் வெளியேற்றப்பட்டீர்கள். மீண்டும் உள்நுழையவும்.',
  'auth.refreshRotated': 'மற்றொரு தாவலில் அமர்வு புதுப்பிக்கப்பட்டது; மீண்டும் முயற்சிக்கவும்',
  'auth.wrongPassword': 'தற்போதைய கடவுச்சொல் தவறு',
  'auth.signupDisabled': 'சுய பதிவு முடக்கப்பட்டுள்ளது',
  'auth.emailExists': 'இந்த மின்னஞ்சலுடன் ஒரு கணக்கு ஏற்கனவே உள்ளது',
  'staff.cannotModify': 'இந்தப் பயனரை மாற்ற உங்களுக்கு அனுமதி இல்லை',
  'staff.cannotAssignRole': '{role} பொறுப்பை நீங்கள் வழங்க முடியாது',
  'staff.cannotAssignOutlet': 'அந்தக் கிளைக்கு பணியாளரை நியமிக்க முடியாது',
  'staff.notAssigned': 'நீங்கள் இந்தக் கிளைக்கு நியமிக்கப்படவில்லை',
  'staff.selfChange': 'உங்கள் சொந்தப் பொறுப்பை மாற்றவோ கணக்கை முடக்கவோ முடியாது',
  'table.exists': 'மேசை {table} ஏற்கனவே உள்ளது',
  'table.hasOpenOrder': 'மேசை {table}-இல் ஏற்கனவே ஒரு திறந்த ஆர்டர் உள்ளது',
  'table.thisHasOpenOrder': 'இந்த மேசையில் திறந்த ஆர்டர் உள்ளது',
  'table.outOfService': 'மேசை {table} பயன்பாட்டில் இல்லை',
  'table.closeOrderFirst': 'முதலில் இந்த மேசையின் ஆர்டரை முடிக்கவும்',
  'table.tooSmall': 'மேசை {table}-இல் {seats} இருக்கைகள் மட்டுமே உள்ளன',
  'table.booked': 'மேசை {table} அந்த நேரத்திற்கு ஏற்கனவே முன்பதிவு செய்யப்பட்டுள்ளது',
  'area.hasTables': 'முதலில் இந்தப் பகுதியிலுள்ள மேசைகளை நகர்த்தவும் அல்லது நீக்கவும்',
  'area.hasHistory': 'இந்தப் பகுதியின் மேசைகளுக்கு ஆர்டர் வரலாறு உள்ளதால் நீக்க முடியாது',
  'menu.categoryHasItems': 'முதலில் இந்த வகையிலுள்ள உணவுகளை நகர்த்தவும் அல்லது காப்பகப்படுத்தவும்',
  'menu.itemUnavailable': '{item} தற்போது கிடைக்கவில்லை',
  'menu.itemsGone': 'சில மெனு உணவுகள் இப்போது இல்லை',
  'menu.unknownModifier': '{item}-க்கு "{modifier}" என்ற விருப்பம் இல்லை',
  'menu.availabilityBoolean': 'கிடைக்கும் நிலை சரி அல்லது தவறு என இருக்க வேண்டும்',
  'recipe.unknownIngredient': 'செய்முறையில் தெரியாத சரக்கு பொருள் உள்ளது',
  'recipe.duplicate': 'செய்முறையில் ஒரே பொருள் இருமுறை உள்ளது',
  'inventory.exists': '{name} ஏற்கனவே உள்ளது',
  'order.notOpen': 'இந்த ஆர்டர் ஏற்கனவே {status}',
  'order.noNewItems': 'அனுப்ப புதிய உணவுகள் இல்லை',
  'order.itemSent': 'சமையலறைக்கு அனுப்பிய உணவை மாற்ற முடியாது; ரத்து செய்யவும்',
  'order.itemVoided': 'இந்த உணவு ஏற்கனவே ரத்து செய்யப்பட்டது',
  'order.voidNeedsManager': 'அனுப்பிய உணவை ரத்து செய்ய மேலாளர் அனுமதி தேவை',
  'order.voidBelowPaid': 'செலுத்திய தொகைக்குக் கீழே ரத்து செய்ய முடியாது; முதலில் பணத்தைத் திருப்பித் தரவும்',
  'order.onlyDineInMove': 'உணவக ஆர்டர்களை மட்டுமே வேறு மேசைக்கு மாற்ற முடியும்',
  'order.discountLimit': '20%-க்கு மேல் தள்ளுபடிக்கு மேலாளர் அனுமதி தேவை',
  'order.discountBelowPaid': 'இந்தத் தள்ளுபடி மொத்தத்தைச் செலுத்திய தொகைக்குக் கீழே கொண்டு செல்லும்',
  'order.refundFirst': 'ஆர்டரை ரத்து செய்யும் முன் பணத்தைத் திருப்பித் தரவும்',
  'order.onlyReadyServed': 'தயாரான உணவுகளை மட்டுமே பரிமாறியதாகக் குறிக்க முடியும்',
  'order.badTransition': 'உணவை {from} நிலையிலிருந்து {to} நிலைக்கு மாற்ற முடியாது',
  'order.concurrentUpdate': 'வேறொருவர் இதை மாற்றியுள்ளார்; புதுப்பித்து மீண்டும் முயற்சிக்கவும்',
  'payment.unsentItems': 'கட்டணம் பெறும் முன் அனுப்பாத உணவுகளை அனுப்பவும் அல்லது நீக்கவும்',
  'payment.nothingDue': 'இந்த ஆர்டருக்குச் செலுத்த வேண்டிய தொகை இல்லை',
  'payment.exceedsBalance': 'தொகை நிலுவையை ({balance}) விட அதிகம்',
  'payment.idempotencyReused': 'இந்தக் கட்டணக் குறிப்பு வேறொரு ஆர்டருக்குப் பயன்படுத்தப்பட்டது',
  'payment.alreadyRefunded': 'இந்தக் கட்டணம் ஏற்கனவே திருப்பித் தரப்பட்டது',
  'license.expired': 'உரிமம் அல்லது சோதனைக் காலம் முடிந்துவிட்டது. புதிய ஆர்டர்கள் நிறுத்தப்பட்டுள்ளன — புதுப்பிக்க உங்கள் விற்பனையாளரைத் தொடர்பு கொள்ளவும்.',
  'license.invalid': 'இந்த உரிம விசை செல்லாது',
  'license.outletLimit': 'உங்கள் உரிமம் {max} கிளை(கள்) மட்டுமே அனுமதிக்கிறது. மேலும் சேர்க்க மேம்படுத்தவும்.',
  'license.onpremOnly': 'உரிம விசைகள் உள்ளக (on-premise) நிறுவல்களுக்கு மட்டுமே',
  'system.notAvailable': 'இந்த வசதி இந்த நிறுவலில் இல்லை',
  'setup.alreadyDone': 'இந்த நிறுவலில் அமைப்பு ஏற்கனவே முடிந்துவிட்டது',
  'reservation.onlyBookedEditable': 'முன்பதிவு நிலையில் உள்ளவற்றை மட்டுமே திருத்த முடியும்',
  'reservation.badTransition': 'முன்பதிவை {from} நிலையிலிருந்து {to} நிலைக்கு மாற்ற முடியாது',
};

export const MESSAGES: Record<Lang, Record<MessageKey, string>> = { en, ta };

export type MessageParams = Record<string, string | number>;

export function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

export function isMessageKey(v: unknown): v is MessageKey {
  return typeof v === 'string' && v in en;
}

/** Param values that are themselves message keys (e.g. entity names) are translated too. */
export function formatMessage(lang: Lang, key: MessageKey, params?: MessageParams): string {
  const resolved = params && Object.fromEntries(Object.entries(params).map(([k, v]) => [k, isMessageKey(v) ? MESSAGES[lang][v] : v]));
  return interpolate(MESSAGES[lang][key] ?? MESSAGES.en[key], resolved);
}
