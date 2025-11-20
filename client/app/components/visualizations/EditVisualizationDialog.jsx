import "codemirror/lib/codemirror.css";
import "codemirror/theme/solarized.css";
import "codemirror/mode/sql/sql";
import "codemirror/mode/javascript/javascript";
import "codemirror/mode/python/python";

import CodeMirror from "codemirror";
import { Controlled as ControlledEditor } from "react-codemirror2";
import { isEqual, extend, map, sortBy, findIndex, filter, pick, omit } from "lodash";
import React, { useState, useMemo, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import Modal from "antd/lib/modal";
import Select from "antd/lib/select";
import Input from "antd/lib/input";
import Button from "antd/lib/button";
import { wrap as wrapDialog, DialogPropType } from "@/components/DialogWrapper";
import Filters, { filterData } from "@/components/Filters";
import notification from "@/services/notification";
import Visualization from "@/services/visualization";
import recordEvent from "@/services/recordEvent";
import useQueryResultData from "@/lib/useQueryResultData";
import { useUniqueId } from "@/lib/hooks/useUniqueId";
import {
  registeredVisualizations,
  getDefaultVisualization,
  newVisualization,
  VisualizationType,
} from "@redash/viz/lib";
import { Renderer, Editor } from "@/components/visualizations/visualizationComponents";
import { safeEvalPreprocessor } from "@redash/viz/lib";
import "./EditVisualizationDialog.less";

window.CodeMirror = CodeMirror;

function updateQueryVisualizations(query, visualization) {
  const index = findIndex(query.visualizations, (v) => v.id === visualization.id);
  if (index > -1) {
    query.visualizations[index] = visualization;
  } else {
    // new visualization
    query.visualizations.push(visualization);
  }
  query.visualizations = [...query.visualizations]; // clone array
}

function saveVisualization(visualization) {
  if (visualization.id) {
    recordEvent("update", "visualization", visualization.id, { type: visualization.type });
  } else {
    recordEvent("create", "visualization", null, { type: visualization.type });
  }

  return Visualization.save(visualization)
    .then((result) => {
      notification.success("Visualization saved");
      return result;
    })
    .catch((error) => {
      notification.error("Visualization could not be saved");
      return Promise.reject(error);
    });
}

function confirmDialogClose(isDirty) {
  return new Promise((resolve, reject) => {
    if (isDirty) {
      Modal.confirm({
        title: "Visualization Editor",
        content: "Are you sure you want to close the editor without saving?",
        okText: "Yes",
        cancelText: "No",
        onOk: () => resolve(),
        onCancel: () => reject(),
      });
    } else resolve();
  });
}

function EditVisualizationDialog({ dialog, visualization, query, queryResult }) {
  const errorHandlerRef = useRef();
  const isNew = !visualization;
  const rawData = useQueryResultData(queryResult);
  const [filters, setFilters] = useState(rawData.filters);

  const [processedData, setProcessedData] = useState(rawData);
  const [isProcessing, setIsProcessing] = useState(false);

  // 1️⃣ Initial Options (Bootstrap)
  const defaultState = useMemo(() => {
    const config = visualization ? registeredVisualizations[visualization.type] : getDefaultVisualization();

    const initialOptions = config.getOptions(isNew ? {} : visualization.options, rawData);
    return {
      type: config.type,
      name: isNew ? config.name : visualization.name,
      options: initialOptions,
      originalOptions: initialOptions,
    };
  }, [rawData, isNew, visualization]);

  const [type, setType] = useState(defaultState.type);
  const [name, setName] = useState(defaultState.name);
  const [nameChanged, setNameChanged] = useState(false);
  const [options, setOptions] = useState(defaultState.options);
  const [saveInProgress, setSaveInProgress] = useState(false);

  // 2️⃣ Run Preprocessor Whenever Options or Raw Data Change
  useEffect(() => {
    let cancelled = false;

    async function processData() {
      setIsProcessing(true);
      try {
        const preCode = options?.preProcessorCode;
        const result = await safeEvalPreprocessor(preCode, rawData);
        if (!cancelled) setProcessedData(result || rawData);
      } catch (err) {
        console.error("Error running preprocessor:", err);
        if (!cancelled) setProcessedData(rawData);
      } finally {
        if (!cancelled) setIsProcessing(false);
      }
    }

    processData();
    return () => {
      cancelled = true;
    };
  }, [rawData, options?.preProcessorCode]);

  // 3️⃣ Always Refresh Options When Processed Data Updates
  useEffect(() => {
    if (isProcessing) return;
    const config = registeredVisualizations[type];
    if (!config || typeof config.getOptions !== "function") return;

    const updatedOptions = config.getOptions(options, processedData);
    if (!isEqual(updatedOptions, options)) setOptions(updatedOptions);
  }, [processedData, type, isProcessing, options]);

  useEffect(() => {
    if (errorHandlerRef.current) errorHandlerRef.current.reset();
  }, [processedData, options]);

  const [preProcessorCode, setPreProcessorCode] = useState(
    options?.preProcessorCode || "function preprocess(data) { return data; }"
  );

  useEffect(() => {
    if (options?.preProcessorCode !== preProcessorCode) {
      setPreProcessorCode(options?.preProcessorCode || "function preprocess(data) { return data; }");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options?.preProcessorCode]);

  function onTypeChanged(newType) {
    setType(newType);

    const config = registeredVisualizations[newType];
    if (!nameChanged) {
      setName(config.name);
    }

    setOptions(config.getOptions(isNew ? {} : visualization.options, processedData));
  }

  function onNameChanged(newName) {
    setName(newName);
    setNameChanged(newName !== name);
  }

  function onOptionsChanged(newOptions) {
    const config = registeredVisualizations[type];
    setOptions(config.getOptions(newOptions, processedData));
  }

  const handleApplyPreprocessor = () => {
    const newOptions = { ...options, preProcessorCode };
    const config = registeredVisualizations[type];
    setOptions(config.getOptions(newOptions, rawData));
  };

  function save() {
    setSaveInProgress(true);
    let visualizationOptions = options;
    if (type === "TABLE") {
      visualizationOptions = omit(visualizationOptions, ["paginationSize"]);
    }

    const visualizationData = extend(newVisualization(type), visualization, {
      name,
      options: visualizationOptions,
      query_id: query.id,
    });
    saveVisualization(visualizationData).then((savedVisualization) => {
      updateQueryVisualizations(query, savedVisualization);
      dialog.close(savedVisualization);
    });
  }

  function dismiss() {
    const optionsChanged = !isEqual(options, defaultState.originalOptions);
    confirmDialogClose(nameChanged || optionsChanged)
      .then(dialog.dismiss)
      .catch(() => {});
  }

  // When editing existing visualization chart type selector is disabled, so add only existing visualization's
  // descriptor there (to properly render the component). For new visualizations show all types except of deprecated
  const availableVisualizations = isNew
    ? filter(sortBy(registeredVisualizations, ["name"]), (vis) => !vis.isDeprecated)
    : pick(registeredVisualizations, [type]);

  const vizTypeId = useUniqueId("visualization-type");
  const vizNameId = useUniqueId("visualization-name");
  const preProcessorId = useUniqueId("preprocessor");

  const filteredData = useMemo(
    () => ({
      columns: rawData.columns,
      rows: filterData(rawData.rows, filters),
    }),
    [rawData, filters]
  );

  return (
    <Modal
      {...dialog.props}
      wrapClassName="ant-modal-fullscreen"
      title="Visualization Editor"
      okText="Save"
      okButtonProps={{
        loading: saveInProgress,
        disabled: saveInProgress,
      }}
      onOk={save}
      onCancel={dismiss}
      wrapProps={{ "data-test": "EditVisualizationDialog" }}>
      <div className="edit-visualization-dialog">
        <div className="visualization-settings">
          <div className="m-b-15">
            <label htmlFor={vizTypeId}>Visualization Type</label>
            <Select
              data-test="VisualizationType"
              id={vizTypeId}
              className="w-100"
              disabled={!isNew}
              value={type}
              onChange={onTypeChanged}>
              {map(availableVisualizations, (vis) => (
                <Select.Option key={vis.type} data-test={"VisualizationType." + vis.type}>
                  {vis.name}
                </Select.Option>
              ))}
            </Select>
          </div>
          <div className="m-b-15">
            <label htmlFor={vizNameId}>Visualization Name</label>
            <Input
              data-test="VisualizationName"
              id={vizNameId}
              className="w-100"
              value={name}
              onChange={(event) => onNameChanged(event.target.value)}
            />

            <div className="m-b-15">
              <label htmlFor={preProcessorId}>Data Pre-Processor (JS)</label>
              <p className="text-muted">
                Optional JavaScript function to modify <code>data</code> before rendering.
                <br />
                Define: <code>function preprocess(data)</code> and return modified data.
              </p>

              <ControlledEditor
                id={preProcessorId}
                value={preProcessorCode}
                options={{
                  mode: "javascript",
                  lineNumbers: true,
                  theme: "default",
                }}
                onBeforeChange={(editor, data, value) => setPreProcessorCode(value)}
              />

              <div style={{ marginTop: 8, textAlign: "right" }}>
                <Button
                  type="primary"
                  size="small"
                  onClick={handleApplyPreprocessor}
                  disabled={preProcessorCode === options.preProcessorCode || isProcessing}>
                  Apply Preprocessor
                </Button>
              </div>
            </div>
          </div>

          <div data-test="VisualizationEditor">
            <Editor
              type={type}
              data={rawData}
              options={options}
              visualizationName={name}
              onOptionsChange={onOptionsChanged}
            />
          </div>
        </div>
        <div className="visualization-preview">
          <label htmlFor="visualization-preview" className="invisible hidden-xs">
            Preview
          </label>
          <Filters filters={filters} onChange={setFilters} />
          <div className="scrollbox" data-test="VisualizationPreview">
            {isProcessing ? (
              <div className="p-3 text-muted">Processing data...</div>
            ) : (
              <Renderer
                type={type}
                data={filteredData}
                options={options}
                visualizationName={name}
                onOptionsChange={onOptionsChanged}
              />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

EditVisualizationDialog.propTypes = {
  dialog: DialogPropType.isRequired,
  query: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
  visualization: VisualizationType,
  queryResult: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
};

EditVisualizationDialog.defaultProps = {
  visualization: null,
};

export default wrapDialog(EditVisualizationDialog);
