import Stream, { type StreamProps } from "../stream/Stream";
import type { StreamSourceMessage } from "../stream/types";

export default function ContactStreamTab<M extends StreamSourceMessage>({
  adapter,
  viewer,
  onMakeTodo,
}: Pick<StreamProps<M>, "adapter" | "viewer" | "onMakeTodo">) {
  return (
    <div className="cdm-stream">
      <Stream adapter={adapter} viewer={viewer} threadMode="replace" onMakeTodo={onMakeTodo} />
    </div>
  );
}
