import React, { useCallback } from 'react'
import ReactDOM from 'react-dom';
import { useDropzone } from 'react-dropzone'
import iconv from "iconv-lite";
import parse from 'csv-parse'
import { CSVLink } from "react-csv";

import './index.css';

function MyDropzone(props: any) {
  const onDrop = useCallback(props.onDrop, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop })

  return (
    <div {...getRootProps({ className: 'dropzone' })}>
      <input {...getInputProps()} />
      {
        isDragActive ?
          <p>ファイルを開く ...</p> :
          <p>CSVファイルをドロップ。もしくはクリックして選択。</p>
      }
    </div>
  )
}

type ColumnsType = { key: string, value: string };
type ResultType = Map<string, string[]> | string | null;
interface AppState {
  cols: ColumnsType,
  preset_disabled: boolean[],
  result: ResultType,
}

type PresetType = { name: string, cols: ColumnsType };
const PRESETS: ReadonlyArray<PresetType> = [
  { name: '統計確認', cols: { key: 'MLアドレス', value: 'MLメンバー' } },
  { name: 'ML管理', cols: { key: 'MLメールアドレス(編集不可)', value: 'メンバー' } }
];
const PRESET_BUTTON_PREFIX = 'btn_preset';

function Result(props: { result: ResultType, cols: ColumnsType }) {
  if (typeof props.result === 'string') {
    return (
      <div>
        <h2 className="error">エラー</h2>
        <div className="error">
          <p>
            {props.result}
          </p>
        </div>
      </div>
    )
  } else {
    const rows = Array<React.ReactElement>();
    let download: React.ReactElement = <></>;
    if (props.result === null) {
      rows.push(
        <tr key='0'>
          <td></td>
          <td></td>
        </tr>
      )
    } else {
      const csv_data = [[props.cols.key, props.cols.value]];
      props.result.forEach((value, key) => {
        rows.push(
          <tr key={key}>
            <td>{key}</td>
            <td>
              <ol>
                {value.map((e, i) => (<li key={i}>{e}</li>))}
              </ol>
            </td>
          </tr>
        )
        csv_data.push([key, value.join('\n')])
      })
      download = (
        <CSVLink data={csv_data} filename='inverted.csv'>
          <button title='結果をダウンロード'>ダウンロード</button>
        </CSVLink>
      )
    }
    const header = (
      <thead>
        <tr>
          <th>{props.cols.key}</th>
          <th>{props.cols.value}</th>
        </tr>
      </thead>
    )

    return (
      <div>
        <h2>結果</h2>
        <table className="result">
          {header}
          <tbody>
            {rows}
          </tbody>
        </table>
        {download}
      </div>
    )
  }
}

function Buttons(props: { preset_disabled: boolean[], onClick: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void }) {
  const buttons = props.preset_disabled.map((preset_disabled, index) => {
    const attributes = {
      id: PRESET_BUTTON_PREFIX + String(index),
      key: index,
      disabled: preset_disabled,
      onClick: props.onClick,
      title: preset_disabled ? "すでにセットされています。" : describe_preset_button(PRESETS[index].cols),
    };
    return <button {...attributes}>プリセット{index + 1}({PRESETS[index].name})</button>
  })
  return (
    <>
      {buttons}
    </>
  )
}

function Config(props: {
  result: ResultType, cols: ColumnsType, onChange: (event: React.ChangeEvent<HTMLInputElement>) => void,
  preset_disabled: boolean[], onButtonClick: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void
}) {
  return (
    <>
      <h2>設定</h2>
      <details className="dynamic" open={typeof props.result !== 'string'}>
        <summary data-open="閉じる" data-close="開く"></summary>
        <table className="config">
          <tbody>
            <tr>
              <td>
                <label htmlFor="col_key">メーリングリストのヘッダ</label>
              </td>
              <td>
                <input type="text" id="col_key" value={props.cols.key} onChange={props.onChange} />
              </td>
            </tr>
            <tr>
              <td>
                <label htmlFor="col_value">メールアドレスのヘッダ</label>
              </td>
              <td>
                <input type="text" id="col_value" value={props.cols.value} onChange={props.onChange} />
              </td>
            </tr>
          </tbody>
        </table>
        <Buttons preset_disabled={props.preset_disabled} onClick={props.onButtonClick} />
      </details>
    </>

  )
}

function invert<S, T>(keys: S[], values: T[][]): Map<T, S[]> {
  let uniq_values = new Set<T>(values.reduce((sum, e) => sum.concat(e), []));
  const all_values = Array.from(uniq_values).sort()
  const inverted = new Map<T, S[]>(all_values.map(value => [value, []]));
  keys.map((key, key_index) => values[key_index].map(value => inverted.get(value)!.push(key)))
  return inverted;
}

function describe_preset_button(p: ColumnsType) {
  return '"' + p.key + '"と"' + p.value + '"をセットします。';
}
function equal_cols(c1: ColumnsType, c2: ColumnsType) {
  return c1.key === c2.key && c1.value === c2.value;
}

class App extends React.Component<{}, AppState> {

  constructor(props: {}) {
    super(props)
    this.state = {
      cols: PRESETS[0].cols,
      preset_disabled: PRESETS.map(preset => equal_cols(preset.cols, PRESETS[0].cols)),
      result: null,
    }

    this.handleChange = this.handleChange.bind(this);
    this.handleButtonClick = this.handleButtonClick.bind(this);
  }

  handleDrop(acceptedFiles: File[]) {
    const file = acceptedFiles[0];
    const reader = new FileReader()

    reader.onabort = () => alert('file reading was aborted')
    reader.onerror = () => alert('file reading has failed')
    reader.onload = () => {
      // Do whatever you want with the file contents
      if (!(reader.result instanceof ArrayBuffer)) {
        this.setState({
          result: 'Something went wrong with FileReader',
        })
        return;
      }
      const binary = reader.result;
      const decodedStr = iconv.decode(Buffer.from(binary), "windows-31j")

      let header: string[] = [];
      const body: string[][] = [];

      // Create the parser
      const parser = parse({
        delimiter: ',',
        skip_empty_lines: true,
      })
      // Use the readable stream api
      parser.on('readable', () => {
        let record: string[];
        while (Boolean(record = parser.read())) {
          if (header.length === 0) {
            header = record;
          } else {
            body.push(record);
          }
        }
      })
      // Catch any error
      parser.on('error', (err: any) => {
        this.setState({
          result: 'CSVのパースに失敗しました。' + err.message,
        })
      })

      parser.on('end', () => {
        const key_col_name = this.state.cols.key;
        const value_col_name = this.state.cols.value;
        const col_ml_addr = header.findIndex(name => name === key_col_name);
        if (col_ml_addr === -1) {
          this.setState({
            result: '[' + key_col_name + ']が見つかりませんでした。ヘッダは次の中から選ぶ必要があります。{' + header.join(', ') + '}',
          })
          return;
        }
        const col_ml_member = header.findIndex(name => name === value_col_name);
        if (col_ml_member === -1) {
          this.setState({
            result: '[' + value_col_name + ']が見つかりませんでした。ヘッダは次の中から選ぶ必要があります。{' + header.join(', ') + '}',
          })
          return;
        }
        const ml_addrs = body.map(row => row[col_ml_addr])
        const members = body.map(row => row[col_ml_member].split('\n').filter(e => e.length > 0))
        const addr2ml = invert(ml_addrs, members)
        this.setState({
          result: addr2ml,
        });
      })
      parser.write(decodedStr)
      parser.end()
    }
    reader.readAsArrayBuffer(file)
  }

  handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const { target: { id, value } } = event;
    const cols: ColumnsType = { ...this.state.cols };
    if (id === 'col_key') {
      cols.key = value;
    }
    if (id === 'col_value') {
      cols.value = value;
    }
    this.setState({
      cols: cols,
      preset_disabled: PRESETS.map(preset => equal_cols(preset.cols, PRESETS[0].cols)),
    })
  }

  handleButtonClick(event: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
    const id = event.currentTarget.id;
    const button_index = parseInt(id.replace(PRESET_BUTTON_PREFIX, ''));
    let preset_disabled = Array<boolean>(PRESETS.length).fill(false);
    preset_disabled[button_index] = true;
    this.setState({
      cols: PRESETS[button_index].cols,
      preset_disabled: preset_disabled,
    })
  }

  render() {
    return (
      <div className="container">
        <MyDropzone
          onDrop={(acceptedFiles: File[]) => this.handleDrop(acceptedFiles)} />
        <Result result={this.state.result} cols={this.state.cols} />
        <Config result={this.state.result} cols={this.state.cols} onChange={this.handleChange}
          preset_disabled={this.state.preset_disabled} onButtonClick={this.handleButtonClick} />
      </div>
    )
  }
}

ReactDOM.render(
  <App />,
  document.getElementById('root')
);