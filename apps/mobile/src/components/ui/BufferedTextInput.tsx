import { useEffect, useRef, useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';

/**
 * A drop-in controlled `TextInput` for fields whose owner re-renders late.
 *
 * Inside a `Sheet` the owner (LogSheet, EditContactSheet…) sits outside the
 * BottomSheetModal, whose portal forwards new children from an effect — so
 * after a keystroke the field first re-renders with the owner's OLD `value`.
 * RN's TextInput treats that as JS rejecting the edit and pushes the old text
 * back to native, and Android rescales the caret into it: typing mid-text puts
 * each next letter before the last one. Rendering a local copy keeps the value
 * current in that first render.
 *
 * Values the owner sends back that this field emitted itself are echoes — late
 * ones are dropped; any other value is the owner's own (a reset, a prefill) and
 * wins. An owner that rewrites the text it receives (a digits-only filter) is
 * not supported: the rewritten value may never change the prop.
 */
export function BufferedTextInput({ value, onChangeText, ...rest }: TextInputProps) {
  const [local, setLocal] = useState(value);
  const sent = useRef<string[]>([]);

  useEffect(() => {
    const echo = value === undefined ? -1 : sent.current.indexOf(value);
    if (echo >= 0) {
      sent.current = sent.current.slice(echo + 1);
      return;
    }
    sent.current = [];
    setLocal(value);
  }, [value]);

  const change = (next: string) => {
    sent.current.push(next);
    setLocal(next);
    onChangeText?.(next);
  };

  return <TextInput {...rest} value={local} onChangeText={change} />;
}
