import { describe, expect, it } from 'vitest'
import { facts } from '../src/data/facts'
import { airlineGroups, airportGroups, groups, planeGroups, tripGroups } from '../src/data/indexes'
import { legs } from '../src/data'

// Snapshot of the workbook as of 2026-10-05 03:27 UTC (10 legs added since the fun-facts thread's 2026-10-04 snapshot). If flights are added these move;
// update the expectations alongside the data so a silent change in a rule still fails.
describe('facts', () => {
  it('matches the fun-facts snapshot', () => {
    expect(facts.legs).toBe(1557)
    expect(facts.miles).toBe(1_887_679)
    expect(facts.laps).toBeCloseTo(75.8, 1)
    expect(facts.moonTrips).toBeCloseTo(4.0, 1)
    expect(Math.round(facts.lightSeconds)).toBe(10)
    expect(facts.countries).toBe(51)
    expect(facts.airlines).toBe(75)
    expect(facts.types).toBe(224)
    expect(facts.planes).toBe(844)
    expect(facts.bestYear).toMatchObject({ year: 2001, miles: 172_255, legs: 81 })
    expect(facts.busiestYear).toMatchObject({ year: 2014, legs: 113 })
    expect(facts.longest[0]).toEqual({ id: 869, miles: 7417 })
    expect(facts.busiestDay).toEqual({ date: '2011-03-14', legs: [975, 976, 977, 978, 979, 980, 981, 982] })
    expect(facts.equatorCrossings).toBe(20)
    expect(facts.jumbo).toMatchObject({ legs: 119, miles: 342_867 })
    expect(facts.international.miles).toBe(738_787)
    expect(facts.hockey).toMatchObject({ legs: 35, miles: 27_513, airports: 33, airlines: 10 })
    expect(facts.osaka).toMatchObject({ legs: 194, miles: 369_812 })
    expect(facts.topAirline).toMatchObject({ key: 'UA', count: 611 })
  })
})

describe('indexes', () => {
  it('ranks every list by count, descending', () => {
    for (const list of [airportGroups, airlineGroups, planeGroups, tripGroups])
      list.forEach((g, i) => i && expect(list[i - 1].count).toBeGreaterThanOrEqual(g.count))
  })

  it('covers every leg exactly once in trips', () => {
    expect(tripGroups.reduce((n, t) => n + t.count, 0)).toBe(legs.length)
    expect(tripGroups.length).toBe(468)
  })

  it('finds a trip by its id with its legs in order', () => {
    const hockey = groups.trip.get('266')!
    expect(hockey.count).toBe(35)
    expect(hockey.legs[0]).toBe(747)
    expect(hockey.purpose).toMatch(/30 Games/)
  })

  it('flags defunct airlines', () => {
    expect(groups.airline.get('PA')?.defunct).toBe(true)
    expect(groups.airline.get('UA')?.defunct).toBe(false)
  })
})
