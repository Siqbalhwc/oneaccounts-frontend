const fs = require('fs');
const path = require('path');

const files = [
  'src/app/dashboard/banking/bank-accounts/page.tsx',
  'src/app/dashboard/customers/page.tsx',
  'src/app/dashboard/payments/page.tsx',
  'src/app/dashboard/products/page.tsx',
  'src/app/dashboard/reports/budget-vs-actual/page.tsx',
];

files.forEach((file) => {
  const filePath = path.resolve(file);
  const buffer = fs.readFileSync(filePath);
  const text = buffer.toString('utf8', 0, buffer.length);
  fs.writeFileSync(filePath, text, 'utf8');
  console.log(`Cleaned: ${file}`);
});

console.log('All files cleaned.');