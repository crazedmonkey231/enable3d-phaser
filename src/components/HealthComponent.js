import { StatPart, StatTracker, partTypes } from './StatComponent.js'

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
