const FIRST = [
  'Ada', 'Yuri', 'Mae', 'Valentina', 'Katherine', 'Saly', 'Buzz', 'Ellen',
  'Chris', 'Kalpana', 'Eileen', 'Peggy', 'Guion', 'Mamoru', 'Soichi', 'Liu',
  'Anousheh', 'Sunita', 'Victor', 'Chiaki', 'Samantha', 'Oleg', 'Jessica',
]
const LAST = [
  'Volkov', 'Hadfield', 'Jemison', 'Tereshkova', 'Johnson', 'Ride', 'Aldrin',
  'Onufrienko', 'Chawla', 'Collins', 'Whitson', 'Bluford', 'Mohri', 'Noguchi',
  'Yang', 'Ansari', 'Williams', 'Glover', 'Mukai', 'Cristoforetti', 'Wakata',
  'Meir', 'Kornienko', 'Kelly',
]

export function crewName(rng: () => number): string {
  return `${FIRST[(rng() * FIRST.length) | 0]} ${LAST[(rng() * LAST.length) | 0]}`
}
