import { formatAmount } from '@/lib/number-format';
import Decimal from 'decimal.js-light';

const Money = Decimal.clone({ precision: 40 });
const entered = (value: number) => new Money(Number.isFinite(value) ? value : 0);

// Keep the server's unrounded decimal equation; round only the displayed currency.
export function invoiceAmounts(items: {quantity: number; unit_price: number}[], adjustments: {
    tax_amount: number; shipping_cost: number; discount_amount: number;
}) {
    const subtotal = items.reduce((sum, item) => sum.plus(entered(item.quantity).times(entered(item.unit_price))), new Money(0));
    const total = subtotal.plus(entered(adjustments.tax_amount)).plus(entered(adjustments.shipping_cost)).minus(entered(adjustments.discount_amount));
    return { subtotal, total, exceedsTotal: (paid: number) => entered(paid).greaterThan(total) };
}

export function formatInvoiceAmount(value: Decimal | number) {
    return formatAmount(new Money(value).toFixed());
}
