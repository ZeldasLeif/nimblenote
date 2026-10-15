// Built-in aliases: alias -> target category display name. Users add their own in settings.
export const BUILTIN_ALIASES: ReadonlyArray<[string, string]> = [
  ['pw', 'passwords'], ['pwd', 'passwords'], ['pass', 'passwords'], ['password', 'passwords'],
  ['pin', 'passwords'],
  ['bday', 'birthdays'], ['bdays', 'birthdays'], ['birthday', 'birthdays'],
  ['addr', 'addresses'], ['address', 'addresses'],
  ['grocery', 'groceries'], ['shopping', 'groceries'], ['shop', 'groceries'],
  ['todos', 'todo'], ['to-do', 'todo'],
];
