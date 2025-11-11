import React, { useMemo } from "react";
import { EditorPropTypes } from "@/visualizations/prop-types";
import registeredVisualizations from "@/visualizations/registeredVisualizations";
import { useProcessedData } from "@/lib/hooks/useProcessedData";

/*
(ts-migrate) TODO: Migrate the remaining prop types
...EditorPropTypes
*/
type Props = {
  type: string;
} & typeof EditorPropTypes;

export default function Editor({ type, options: optionsProp, data, ...otherProps }: Props) {
  // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  const { processedData, isLoading } = useProcessedData(data, optionsProp?.preProcessorCode);

  // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  const { Editor, getOptions } = registeredVisualizations[type];
  const options = useMemo(() => getOptions(optionsProp, processedData), [optionsProp, processedData]);

  if (isLoading) {
    return (
      <div style={{ padding: 10, fontSize: 13 }}>
        ⏳ <b>Running Preprocessor...</b>
      </div>
    );
  }
  // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  if (processedData?.error) {
    return (
      <div className="visualization-renderer">
        <div
          style={{
            padding: 10,
            color: "red",
            fontSize: 13,
            background: "#fff4f4",
            borderRadius: 4,
            marginBottom: 5,
          }}>
          <b>⚠️ Data Preprocessor Error:</b>{" "}
          {
            // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            processedData.error
          }
        </div>
      </div>
    );
  }
  return <Editor options={options} data={processedData} {...otherProps} />;
}
