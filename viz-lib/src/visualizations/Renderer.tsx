import { isEqual } from "lodash";
import React, { useEffect, useRef } from "react";
import ErrorBoundary, { ErrorMessage } from "@/components/ErrorBoundary";
import { RendererPropTypes } from "@/visualizations/prop-types";
import registeredVisualizations from "@/visualizations/registeredVisualizations";
import { useProcessedData } from "@/lib/hooks/useProcessedData";

/*
(ts-migrate) TODO: Migrate the remaining prop types
...RendererPropTypes
*/
type Props = {
  type: string;
  addonBefore?: React.ReactNode;
  addonAfter?: React.ReactNode;
} & typeof RendererPropTypes;

export default function Renderer({
  type,
  data,
  options: optionsProp,
  visualizationName,
  addonBefore,
  addonAfter,
  ...otherProps
}: Props) {
  const lastOptions = useRef();
  const errorHandlerRef = useRef();

  // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  const { Renderer, getOptions } = registeredVisualizations[type];
  // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  const { processedData, isLoading } = useProcessedData(data, optionsProp?.preProcessorCode);

  // Avoid unnecessary updates (which may be expensive or cause issues with
  // internal state of some visualizations like Table) - compare options deeply
  // and use saved reference if nothing changed
  // More details: https://github.com/getredash/redash/pull/3963#discussion_r306935810
  let options = getOptions(optionsProp, processedData);
  if (isEqual(lastOptions.current, options)) {
    options = lastOptions.current;
  }
  lastOptions.current = options;

  useEffect(() => {
    if (errorHandlerRef.current) {
      // @ts-expect-error ts-migrate(2532) FIXME: Object is possibly 'undefined'.
      errorHandlerRef.current.reset();
    }
  }, [optionsProp, processedData]);

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
        {addonBefore}
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
        {addonAfter}
      </div>
    );
  }

  return (
    <div className="visualization-renderer">
      {addonBefore}
      {/* @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call. */}
      <ErrorBoundary
        ref={errorHandlerRef}
        renderError={() => <ErrorMessage>Error while rendering visualization.</ErrorMessage>}>
        <div className="visualization-renderer-wrapper">
          <Renderer options={options} data={processedData} visualizationName={visualizationName} {...otherProps} />
        </div>
      </ErrorBoundary>
      {addonAfter}
    </div>
  );
}
