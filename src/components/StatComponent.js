import { GameObjectComponent } from '../engine/GameObject.js'


/**
 * Enum for different part types.
 * @readonly
 * @enum {string}
 * @property {string} BASE - Represents the base part type.
 * @property {string} MIN - Represents the minimum part type.
 * @property {string} MAX - Represents the maximum part type.
 * @property {string} INCREASE - Represents the increase part type. How much to increase the stat from its base value.
 * @property {string} DECREASE - Represents the decrease part type. How much to decrease the stat from its base value.
 */
export const partTypes = {
  BASE: 'base',
  MIN: 'min',
  MAX: 'max',
  INCREASE: 'increase',
  DECREASE: 'decrease',
}

/**
 * Represents a part of a statistic with a specific type and value.
 *
 * @class
 * @param {string} partType - The type of the statistic part.
 * @param {*} value - The value associated with the statistic part.
 */
export class StatPart {
  constructor(partType, value) {
    this.partType = partType
    this.value = value
  }
}

/**
 * Represents a statistic with a name and multiple parts (base, min, max, etc.).
 * Allows adding and removing parts, collapsing all parts into a single base value,
 * and retrieving the current stat value.
 *
 * @class
 * @property {string} name - The name of the stat.
 * @property {StatPart[]} statParts - The parts that make up the stat (base, min, max, etc.).
 *
 * @param {string} name - The name of the stat.
 * @param {number} [value=0] - The initial base value of the stat.
 * @param {number} [min=0] - The minimum value of the stat.
 * @param {number} [max=0] - The maximum value of the stat.
 *
 * @method addPart Adds a new StatPart to the stat.
 * @param {StatPart} statPart - The stat part to add.
 *
 * @method removePart Removes a StatPart by its part name.
 * @param {string} partName - The name of the part to remove.
 *
 * @method collapseParts Collapses all parts into a single base value, enforcing min and max.
 * @returns {number} The total value before collapsing.
 *
 * @method getStatValue Gets the current base value of the stat.
 * @returns {number} The current base value.
 */
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
      if (part.partType === partTypes.BASE || part.partType === partTypes.INCREASE || part.partType === partTypes.DECREASE) {
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

 /**
 * StatTracker is a component for tracking and managing multiple stats for a game object.
 * Each stat can have a value, minimum, maximum, and can be composed of multiple parts.
 * 
 * @extends GameObjectComponent
 * 
 * @class
 * @param {GameObject} parent - The parent game object to which this component is attached.
 * @param {string} [name="StatTracker"] - The name of the component.
 * @param {Object} [stats={}] - An object containing initial stats, where each key is the stat name and the value is an object with `value`, `min`, and `max` properties.
 * 
 * @property {Object.<string, Stat>} stats - A dictionary of stat names to Stat instances.
 * @property {boolean} debug - Flag for enabling debug mode.
 * 
 * @method update
 * @param {number} dt - Delta time since last update.
 * 
 * @method addStat
 * @param {string} statName - The name of the stat to add.
 * @param {number} value - The initial value of the stat.
 * @param {number} [min=0] - The minimum value of the stat.
 * @param {number} [max=100] - The maximum value of the stat.
 * 
 * @method removeStat
 * @param {string} statName - The name of the stat to remove.
 * 
 * @method getStat
 * @param {string} statName - The name of the stat to retrieve.
 * @returns {number} The current value of the stat, or 0 if not found.
 * 
 * @method addStatPart
 * @param {string} statName - The name of the stat to add a part to.
 * @param {Object} statPart - The part to add to the stat.
 * 
 * @method removeStatPart
 * @param {string} statName - The name of the stat to remove a part from.
 * @param {string} partName - The name of the part to remove.
 * 
 * @method getAllStats
 * @returns {Object.<string, number>} An object mapping stat names to their current values.
 * 
 * @method collapseStatParts
 * @param {string} statName - The name of the stat to collapse parts for.
 * @returns {*} The collapsed value or structure for the stat, or null if not found.
 * 
 * @method collapsePartsAll
 * @returns {Object.<string, *>} An object mapping stat names to their collapsed values or structures.
 */
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