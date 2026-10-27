import test from 'node:test';
import assert from 'node:assert/strict';
import {normaliseSymbol, parseYahooChart, parseTwelveData} from '../src/worker.js';

test('ticker normalisation and validation', () => {
  assert.equal(normaliseSymbol(' qqq '), 'QQQ');
  assert.equal(normaliseSymbol('0700.hk'), '0700.HK');
  assert.equal(normaliseSymbol('^GSPC'), '^GSPC');
  assert.equal(normaliseSymbol('<img src=x>'), null);
});

test('Yahoo data parser removes invalid and sorts dates', () => {
  const data = {chart:{result:[{timestamp:[1727740800,1727654400,1727568000],meta:{symbol:'AAPL',currency:'USD'},indicators:{quote:[{close:[10,null,9]}]}}]}};
  const parsed = parseYahooChart(data,'AAPL');
  assert.equal(parsed.points.length,2);
  assert.ok(parsed.points[0].close === 9);
});

test('Twelve Data parser converts descending rows to ascending order', () => {
  const data={meta:{symbol:'NVDA',currency:'USD'},values:[{datetime:'2026-10-27',close:'20'},{datetime:'2026-10-26',close:'10'}],status:'ok'};
  const parsed=parseTwelveData(data,'NVDA');
  assert.deepEqual(parsed.points.map(p=>p.close),[10,20]);
});
