'use strict';

function sum(list) {
  return list.reduce((a, b) => a + b, 0);
}

class Stats {
  constructor(values) {
    this._values = values.slice().sort((a, b) => a - b);
    this._count = this._values.length;
  }

  min() {
    return this._values[0];
  }

  max() {
    return this._values[this._count - 1];
  }

  median() {
    return this.percentile(50);
  }

  percentile(n) {
    let index = Math.floor((this._count - 1) * n / 100);
    return this._values[index];
  }

  mean() {
    this._mean = this._mean || sum(this._values) / this._count;
    return this._mean;
  }

  stddev() {
    let squares = this._values.map((n) => n * n);
    let meanSquare = sum(squares) / this._count;
    let mean = this.mean();
    return Math.sqrt(meanSquare - mean * mean);
  }
}

module.exports = Stats;
