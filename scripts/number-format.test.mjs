import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { formatAmount, formatCurrency, formatQuantity, formatUnitCost, formatPercentage, formatNumberInput, numberFieldKind, validateNumberInput } from '../src/lib/number-format.ts';

test('Reported long cost decimals round to readable prices', () => {
    assert.equal(formatUnitCost(117.80977912731655), '117.81');
    assert.equal(formatUnitCost(83.00388739642251), '83.00');
    assert.equal(formatUnitCost(55.8502461891194), '55.85');
    assert.equal(formatUnitCost(36.75395326367605), '36.75');
});
test('Decimal ties and large numeric strings keep exact rounding', () => {
    assert.equal(formatAmount('1234567.895'), '1,234,567.90');
    assert.equal(formatAmount('-10.125'), '-10.13');
    assert.equal(formatAmount('9007199254740993.125'), '9,007,199,254,740,993.13');
});
test('Quantities trim insignificant zeros and floating point tails', () => {
    assert.equal(formatQuantity(1234.56789), '1,234.568');
    assert.equal(formatQuantity(0.1 + 0.2), '0.3');
    assert.equal(formatQuantity('1.23000'), '1.23');
    assert.equal(formatQuantity(-0), '0');
});
test('Small nonzero inventory values remain visible', () => {
    assert.equal(formatUnitCost('.0042'), '0.0042');
    assert.equal(formatQuantity('.000001'), '0.000001');
    assert.equal(formatQuantity('.00000000002'), 'أقل من 0.000001');
    assert.equal(formatQuantity('-.00000000002'), 'بين -0.000001 و0');
    assert.equal(formatAmount('.0042'), 'أقل من 0.01');
});
test('Missing or invalid values are distinct from a real zero', () => {
    for (const input of [null, undefined, '', NaN, Infinity, 'oops']) {
        assert.equal(formatAmount(input), 'غير متاح');
        assert.equal(formatQuantity(input), 'غير متاح');
        assert.equal(formatCurrency(input), 'غير متاح');
    }
    assert.equal(formatAmount(0), '0.00');
});
test('Percentages use two places without trailing zeros', () => {
    assert.equal(formatPercentage(33.33333333), '33.33');
    assert.equal(formatPercentage(25), '25');
    assert.equal(formatPercentage(-1.005), '-1.01');
});
test('Numeric inputs stay compact without grouping or a false zero', () => {
    assert.equal(formatNumberInput(117.80977912731655, 'unitCost'), '117.81');
    assert.equal(formatNumberInput(83.00388739642251, 'amount'), '83.00');
    assert.equal(formatNumberInput(1234.56789), '1234.568');
    assert.equal(formatNumberInput(.0042, 'unitCost'), '0.0042');
    assert.equal(formatNumberInput(.000000020003), '2e-8');
    assert.equal(formatNumberInput(NaN), '');
    assert.equal(numberFieldKind('items.0.unit_price'), 'unitCost');
    assert.equal(numberFieldKind('items.0.quantity'), 'quantity');
    assert.equal(numberFieldKind('tax_amount'), 'amount');
});
test('Native min max and step constraints check raw values before rounding', () => {
    assert.notEqual(validateNumberInput(.0099, { min: '.01', step: '.01' }), true);
    assert.notEqual(validateNumberInput(.015, { min: '.01', step: '.01' }), true);
    assert.equal(validateNumberInput(.02, { min: '.01', step: '.01' }), true);
    assert.notEqual(validateNumberInput(1.5, {}), true);
    assert.equal(validateNumberInput(1.5, { step: 'any' }), true);
    assert.equal(validateNumberInput(.015, { min: '.005', step: '.01' }), true);
    assert.notEqual(validateNumberInput(10.0001, { max: '10', step: 'any' }), true);
    assert.equal(validateNumberInput(.1 + .2, { step: '.01' }), true);
});

function presentationSources() {
    const root = fileURLToPath(new URL('../src/', import.meta.url));
    const sources = [];
    function visit(directory) {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) visit(file);
            else if (file.endsWith('.tsx')) sources.push(ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
        }
    }
    visit(root);
    return sources;
}
const uiSources = presentationSources();

test('Money and quantity table columns cannot silently use raw default cells', () => {
    const numericColumns = new Set(['quantity', 'min_stock', 'unit_cost', 'unit_price', 'total_cost', 'total_price', 'sales_price', 'amount', 'balance', 'total_amount', 'paid_amount']);
    for (const source of uiSources) {
        function visit(node) {
            if (ts.isObjectLiteralExpression(node)) {
                const accessor = node.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(source) === 'accessorKey');
                if (accessor && ts.isStringLiteral(accessor.initializer) && numericColumns.has(accessor.initializer.text)) {
                    assert(node.properties.some(property => property.name?.getText(source) === 'cell'), `${source.fileName}: ${accessor.initializer.text} needs a display cell`);
                }
            }
            ts.forEachChild(node, visit);
        }
        visit(source);
    }
});

test('Numeric chart axes have explicit tick formatting', () => {
    for (const source of uiSources) {
        function visit(node) {
            if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
                const name = node.tagName.getText(source);
                const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
                const type = attributes.find(attribute => attribute.name.getText(source) === 'type')?.initializer;
                const numeric = name === 'XAxis' && type?.text === 'number' || name === 'YAxis' && type?.text !== 'category';
                if (numeric) assert(attributes.some(attribute => attribute.name.getText(source) === 'tickFormatter'), `${source.fileName}: ${name} needs tickFormatter`);
            }
            ts.forEachChild(node, visit);
        }
        visit(source);
    }
});
