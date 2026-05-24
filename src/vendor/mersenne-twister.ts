export default class MersenneTwister {
  private state: number;

  constructor(seed = Date.now()) {
    this.state = seed >>> 0;
  }

  random(): number {
    return this.random_int() / 4_294_967_296;
  }

  random_int(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state;
  }
}
