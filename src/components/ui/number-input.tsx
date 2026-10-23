import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ChangeEvent, type FocusEvent } from 'react';
import { useController, type FieldValues, type UseControllerProps } from 'react-hook-form';
import { formatNumberInput, numberFieldKind, validateNumberInput, type NumberFieldKind } from '@/lib/number-format';
import { Input, type InputProps } from './input';

type NumberInputProps = Omit<InputProps, 'value' | 'defaultValue'> & {
    value?: number | string | null;
    formatKind?: NumberFieldKind;
    resetKey?: unknown;
};

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
    ({ value, name, formatKind, resetKey, onChange, onBlur, onFocus, ...props }, ref) => {
        const [draft, setDraft] = useState<{ text: string; numeric: number; resetKey: unknown } | null>(null);
        const input = useRef<HTMLInputElement>(null);
        useImperativeHandle(ref, () => input.current!);
        useEffect(() => {
            const valid = validateNumberInput(value, { min: props.min, max: props.max, step: props.step });
            input.current?.setCustomValidity(valid === true ? '' : valid);
        }, [value, props.min, props.max, props.step]);
        const currentDraft = draft && Object.is(resetKey, draft.resetKey) && (value === draft.text || Object.is(value, draft.numeric));
        return <Input {...props} ref={input} name={name} type="number" inputMode="decimal"
            value={currentDraft ? draft.text : formatNumberInput(value, formatKind ?? numberFieldKind(name))}
            onFocus={event => { setDraft(null); onFocus?.(event); }}
            onChange={event => { setDraft({ text: event.target.value, numeric: event.target.valueAsNumber, resetKey }); onChange?.(event); }}
            onBlur={event => { setDraft(null); onBlur?.(event); }} />;
    },
);
NumberInput.displayName = 'NumberInput';

type FormNumberInputProps<T extends FieldValues> = UseControllerProps<T> &
    Omit<NumberInputProps, 'name' | 'value' | 'disabled'>;

export function FormNumberInput<T extends FieldValues>({ control, name, rules, defaultValue, disabled,
    shouldUnregister, onChange, onBlur, ...props }: FormNumberInputProps<T>) {
    const custom = typeof rules?.validate === 'function' ? { custom: rules.validate } : rules?.validate;
    const { field: { name: fieldName, value: rawValue, onChange: changeRawValue,
        onBlur: touchField, ref: fieldRef, disabled: fieldDisabled }, formState } = useController({ control, name, defaultValue, disabled, shouldUnregister,
        rules: { ...rules, validate: {
            numeric: (value: unknown) => typeof value === 'number' && Number.isFinite(value) || 'أدخل رقمًا صالحًا.',
            nativeBounds: value => validateNumberInput(value, { ...props, defaultValue }), ...custom,
        } } });
    function change(event: ChangeEvent<HTMLInputElement>) {
        changeRawValue(event.target.valueAsNumber);
        onChange?.(event);
    }
    function blur(event: FocusEvent<HTMLInputElement>) {
        // Controller reads the raw form value, not the rounded text in the DOM.
        touchField();
        onBlur?.(event);
    }
    return <NumberInput {...props} resetKey={formState.defaultValues} name={fieldName} value={rawValue} ref={fieldRef}
        disabled={fieldDisabled} onChange={change} onBlur={blur} />;
}
