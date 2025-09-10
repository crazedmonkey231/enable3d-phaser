import { StatPart, StatTracker, partTypes } from './StatComponent.js'

/**
 * HealthComponent manages an entity's health, regeneration, and armor stats.
 * Extends StatTracker to provide stat tracking and manipulation.
 *
 * @class
 * @extends StatTracker
 *
 * @param {Object} parent - The parent entity or object this component is attached to.
 * @param {Object} [options] - Configuration options for the health component.
 * @param {number} [options.health=100] - Initial health value.
 * @param {number} [options.regenRate=0] - Health regeneration rate per second.
 * @param {number} [options.armor=0] - Armor value that reduces incoming damage.
 *
 * @property {boolean} debug - If true, enables debug logging.
 *
 * @method compStart - Called when the component starts; logs initial stats if debug is enabled.
 * @method compUpdate - Called every update tick; handles health regeneration and checks for death.
 * @method damage - Inflicts damage, reduced by armor, and logs the result if debug is enabled.
 * @method heal - Heals the component by a specified amount.
 */
export class HealthComponent extends StatTracker {
  constructor(parent, { health = 100, regenRate = 0, armor = 0 } = {}) {
    super(parent, "HealthComponent", { 
      health: { value: health, min: 0, max: 100 }, 
      regenRate: { value: regenRate, min: 0, max: 999 }, 
      armor: { value: armor, min: 0, max: 999 } 
    })
    this.debug = false
  }

  compStart() {
    if(this.debug) console.log('HealthComponent started with', this.stats)
  }

  compUpdate(dt) {
    // auto-regen
    const regenRate = this.getStat('regenRate')
    if (regenRate > 0) {
      this.addStatPart('health', new StatPart(partTypes.INCREASE, regenRate * dt))
    }
    const collapsedHealth = this.collapseStatParts('health')
    if (collapsedHealth <= 0) {
      this.parent.destroy()
    }
  }

  /**
   * Inflict damage to the health component, considering armor.
   * @param {number} amount - The amount of damage to inflict.
   */
  damage(amount) {
    const armor = this.getStat('armor')
    const effectiveDamage = Math.max(0, amount - armor)
    this.addStatPart('health', new StatPart(partTypes.DECREASE, -effectiveDamage))
    if(this.debug) console.log(`HealthComponent: Took ${effectiveDamage} damage (after armor ${armor}).`)
  }

  /**
   * Heal the health component by a certain amount.
   * @param {number} amount - The amount to heal.
   */
  heal(amount) {
    this.addStatPart('health', new StatPart(partTypes.INCREASE, amount))
  }
}
