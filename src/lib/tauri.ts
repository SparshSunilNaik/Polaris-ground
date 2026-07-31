import { invoke } from '@tauri-apps/api/core'
export const getAppInfo = (): Promise<{ name: string; version: string }> => invoke('get_app_info')
