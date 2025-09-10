import { GameObjectComponent } from '../engine/GameObject.js'

// part types
export const partTypes = {
  BASE: 'base',
  MIN: 'min',
  MAX: 'max',
  HEAL: 'heal',
  DAMAGE: 'damage',
}

// individual stat modification
export class StatPart {
  constructor(partType, value) {
    this.partType = partType
    this.value = value
  }
}

// a stat with multiple parts
export class Stat {
  constructor(name, value = 0, min = 0, max = 0) {
    this.name = name
    this.statParts = [
      new StatPart(partTypes.BASE, value),
      new StatPart(partTypes.MIN, min),
      new StatPart(partTypes.MAX, max)
    ]
  }

  addPart(statPart) {
    this.statParts.push(statPart)
  }

  removePart(partName) {
    this.statParts = this.statParts.filter(part => part.partName !== partName)
  }

  collapseParts() {
    // Collapse all stat parts into the base part
    let totalValue = 0
    this.statParts.forEach(part => {
      if (part.partType === partTypes.BASE || part.partType === partTypes.HEAL || part.partType === partTypes.DAMAGE) {
        totalValue += part.value
      }
    })
    // enforce min if exists
    let totalMin = 0
    this.statParts.forEach(part => {
      if (part.partType === partTypes.MIN) {
        totalMin += part.value
      }
    })
    // cap to max if exists
    let totalMax = 0
    this.statParts.forEach(part => {
      if (part.partType === partTypes.MAX) {
        totalMax += part.value
      }
    })
    // reset parts to just the collapsed base, min, max
    this.statParts = [ 
      new StatPart(partTypes.BASE, Math.min(Math.max(totalValue, totalMin), totalMax)),
      new StatPart(partTypes.MIN, totalMin),
      new StatPart(partTypes.MAX, totalMax)
    ]
    return totalValue
  }

  getStatValue() {
    let totalValue = 0
    this.statParts.forEach(part => {
      if (part.partType === partTypes.BASE) {
        totalValue += part.value
      }
    })
    return totalValue
  }
}

// component to track multiple stats
export class StatTracker extends GameObjectComponent {
  constructor(parent, name = "StatTracker", stats = {}) {
    super(parent, name)
    this.stats = {}
    for (const [statName, value] of Object.entries(stats)) {
      this.addStat(statName, value.value, value.min, value.max)
    }
    this.debug = false
  }

  update(dt) {
    // Optional: Implement any periodic updates to stats if needed
  }

  addStat(statName, value, min = 0, max = 100) {
    if (!this.stats[statName]) {
      this.stats[statName] = new Stat(statName, value, min, max)
    }
  }

  removeStat(statName) {
    delete this.stats[statName]
  }

  getStat(statName) {
    return this.stats[statName] ? this.stats[statName].getStatValue() : 0
  } 

  addStatPart(statName, statPart) {
    this.addStat(statName)
    this.stats[statName].addPart(statPart)
  } 

  removeStatPart(statName, partName) {
    if (this.stats[statName]) {
      this.stats[statName].removePart(partName)
    }
  } 

  getAllStats() {
    const result = {}
    for (const statName in this.stats) {
      result[statName] = this.stats[statName].getStatValue()
    }
    return result
  }

  collapseStatParts(statName) {
    if (this.stats[statName]) {
      return this.stats[statName].collapseParts()
    }
    return null
  }

  collapsePartsAll() {
    const result = {}
    for (const statName in this.stats) {
      result[statName] = this.stats[statName].collapseParts()
    }
    return result
  }
}