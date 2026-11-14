import dataset from '../data/investigations.json'
import type { Dataset, Investigation } from '../types'

const data = dataset as unknown as Dataset

export function getInvestigations(): Investigation[] {
  return data.investigations
}

export function getCategories() {
  return [...new Set(data.investigations.map((i) => i.category))]
}

export function getHazards() {
  return [...new Set(data.investigations.flatMap((i) => i.hazards))]
}
