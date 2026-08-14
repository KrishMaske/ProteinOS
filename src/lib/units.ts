const KG_TO_LB = 2.2046226218;
const CM_TO_IN = 0.3937007874;

export const kgToLb = (kg: number) => kg * KG_TO_LB;
export const lbToKg = (lb: number) => lb / KG_TO_LB;
export const cmToIn = (cm: number) => cm * CM_TO_IN;
export const inToCm = (inches: number) => inches / CM_TO_IN;
export const roundToIncrement = (value: number, increment: number) => Math.round(value / increment) * increment;
