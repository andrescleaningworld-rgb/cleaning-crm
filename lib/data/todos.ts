// To-Dos (the To Do and SmsLog tabs). Routes import from here;
// DATA_SOURCE_TODOS decides whether a call goes to Google Sheets (default,
// today's behavior) or to Postgres. Function names and return shapes are
// identical on both sides.

import { isPostgres } from "@/lib/dataSource";
import * as sheets from "@/lib/googleSheets";
import * as pg from "@/lib/pg/todos";

export type {
  SmsLogEntry,
  ToDo,
  ToDoBulkEditEntry,
  ToDoBulkEditResult,
  ToDoEditInput,
  ToDoEditResult,
  ToDoStatusUpdateResult,
} from "@/lib/googleSheets";

const source = () => (isPostgres("TODOS") ? pg : sheets);

export const fetchToDos: typeof sheets.fetchToDos = () => source().fetchToDos();
export const appendToDo: typeof sheets.appendToDo = (...args) => source().appendToDo(...args);
export const appendToDos: typeof sheets.appendToDos = (...args) => source().appendToDos(...args);
export const updateToDoStatus: typeof sheets.updateToDoStatus = (...args) => source().updateToDoStatus(...args);
export const setToDoCalendarSyncFailed: typeof sheets.setToDoCalendarSyncFailed = (...args) => source().setToDoCalendarSyncFailed(...args);
export const setToDoCalendarFields: typeof sheets.setToDoCalendarFields = (...args) => source().setToDoCalendarFields(...args);
export const updateToDo: typeof sheets.updateToDo = (...args) => source().updateToDo(...args);
export const updateToDosBatch: typeof sheets.updateToDosBatch = (...args) => source().updateToDosBatch(...args);
export const setToDoCalendarFieldsBatch: typeof sheets.setToDoCalendarFieldsBatch = (...args) => source().setToDoCalendarFieldsBatch(...args);
export const updateToDoOutcome: typeof sheets.updateToDoOutcome = (...args) => source().updateToDoOutcome(...args);

export const fetchSmsLogForToDo: typeof sheets.fetchSmsLogForToDo = (...args) => source().fetchSmsLogForToDo(...args);
export const appendSmsLog: typeof sheets.appendSmsLog = (...args) => source().appendSmsLog(...args);
export const fetchLatestSmsQuota: typeof sheets.fetchLatestSmsQuota = () => source().fetchLatestSmsQuota();
export const updateSmsLogStatus: typeof sheets.updateSmsLogStatus = (...args) => source().updateSmsLogStatus(...args);
