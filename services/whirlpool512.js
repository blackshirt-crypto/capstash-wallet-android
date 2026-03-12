const { whirlpool512, whirlpool512String } = require('./whirlpool512');

// Test 1: Empty string ""
// Expected: 19FA61D75522A4669B44E39C1D2E1726C530232130D407F89AFEE0964997F7A7
//           3E83BE698B288FEBCF88E3E03C4F0757EA8964E59B63D93708B138CC42A66EB3
console.log('Empty string:', whirlpool512String(''));

// Test 2: "a"
// Expected: 8ACA2602792AEC6F11A67206531FB7D7F0DFF59413145E6973C45001D0087B42
//           D11BC645413AEFF63A42391A39145A591A92200D560195E53B478584FDAE231A
console.log('Letter a:', whirlpool512String('a'));

// Test 3: 64 zero bytes
console.log('64 zero bytes:', whirlpool512(new Uint8Array(64)));