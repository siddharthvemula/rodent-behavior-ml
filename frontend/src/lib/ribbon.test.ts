import { describe, expect, it } from 'vitest'
import { pickSegment } from './ribbon'

// a 1000 px strip: wide 0-600, thin 600-604, wide 604-700, thin 700-702, wide 702-1000
const spans = [
  { start: 0, end: 600 },
  { start: 600, end: 604 },
  { start: 604, end: 700 },
  { start: 700, end: 702 },
  { start: 702, end: 1000 },
]

describe('pickSegment', () => {
  it('ignores a pointer without a usable position instead of guessing', () => {
    expect(pickSegment(NaN, spans)).toBeNull()
    expect(pickSegment(Infinity, spans)).toBeNull()
  })

  it('returns the segment under the pointer when nothing thin is nearby', () => {
    expect(pickSegment(300, spans)).toBe(0)
    expect(pickSegment(650, spans)).toBe(2)
    expect(pickSegment(900, spans)).toBe(4)
  })

  it('gives thin segments a hit zone wider than themselves', () => {
    expect(pickSegment(602, spans)).toBe(1) // on it
    expect(pickSegment(596, spans)).toBe(1) // 4 px to its left, still inside its 14 px zone
    expect(pickSegment(608, spans)).toBe(1) // 4 px to its right
    expect(pickSegment(701, spans)).toBe(3)
    expect(pickSegment(695, spans)).toBe(3)
  })

  it('does not reach further than the zone, so wide neighbors keep their area', () => {
    expect(pickSegment(590, spans)).toBe(0)
    expect(pickSegment(620, spans)).toBe(2)
  })

  it('picks the nearest thin segment when zones overlap', () => {
    const close = [{ start: 0, end: 100 }, { start: 100, end: 103 }, { start: 103, end: 106 }, { start: 106, end: 200 }]
    expect(pickSegment(101, close)).toBe(1)
    expect(pickSegment(105, close)).toBe(2)
  })

  it('clamps a pointer at the strip edges and handles an empty strip', () => {
    expect(pickSegment(-3, spans)).toBe(0)
    expect(pickSegment(1000, spans)).toBe(4)
    expect(pickSegment(5, [])).toBeNull()
  })
})
