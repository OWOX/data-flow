// Storage, destination and definition-type marks, vendored verbatim from
// owox-data-marts/apps/web/src/shared/icons so the canvas shows the same glyphs the host does.
// Self-contained SVG components — no imports, nothing to keep in sync but the files themselves.
import { Asterisk, Code, Grip, KeyRound, Plug, Sparkles, Table } from 'lucide-react'
import { AwsAthenaIcon } from './aws-athena-icon'
import { AwsRedshiftIcon } from './aws-redshift-icon'
import { AzureSynapseIcon } from './azure-synapse-icon'
import { DataStudioIcon } from './data-studio-icon'
import { DatabricksIcon } from './databricks-icon'
import { EmailIcon } from './email-icon'
import { GoogleBigQueryIcon } from './google-bigquery-icon'
import { GoogleChatIcon } from './google-chat-icon'
import { GoogleSheetsIcon } from './google-sheets-icon'
import { LegacyGoogleBigQueryIcon } from './legacy-google-bigquery-icon'
import { MicrosoftTeamsIcon } from './microsoft-teams-icon'
import { ODataIcon } from './odata-icon'
import { SlackIcon } from './slack-icon'
import { SnowflakeIcon } from './snowflake-icon'

/** Everything on a card is drawn at one size, so `size` is all a mark has to accept. */
export type Mark = (props: { size?: number; className?: string }) => React.ReactNode

export const STORAGE: Record<string, { icon: Mark; label: string }> = {
  GOOGLE_BIGQUERY: { icon: GoogleBigQueryIcon, label: 'Google BigQuery' },
  LEGACY_GOOGLE_BIGQUERY: { icon: LegacyGoogleBigQueryIcon, label: 'Google BigQuery (extension)' },
  AWS_ATHENA: { icon: AwsAthenaIcon, label: 'AWS Athena' },
  AWS_REDSHIFT: { icon: AwsRedshiftIcon, label: 'AWS Redshift' },
  SNOWFLAKE: { icon: SnowflakeIcon, label: 'Snowflake' },
  DATABRICKS: { icon: DatabricksIcon, label: 'Databricks' },
  AZURE_SYNAPSE: { icon: AzureSynapseIcon, label: 'Azure Synapse' },
}

export const DESTINATION: Record<string, { icon: Mark; label: string }> = {
  GOOGLE_SHEETS: { icon: GoogleSheetsIcon, label: 'Google Sheets' },
  LOOKER_STUDIO: { icon: DataStudioIcon, label: 'Data Studio' },
  EMAIL: { icon: EmailIcon, label: 'Email' },
  SLACK: { icon: SlackIcon, label: 'Slack' },
  MS_TEAMS: { icon: MicrosoftTeamsIcon, label: 'Microsoft Teams' },
  GOOGLE_CHAT: { icon: GoogleChatIcon, label: 'Google Chat' },
  ODATA: { icon: ODataIcon, label: 'OData' },
}

/** The host's own definition-type glyphs and names. */
export const KIND: Record<string, { icon: Mark; label: string }> = {
  SQL: { icon: Code, label: 'SQL' },
  TABLE: { icon: Table, label: 'Table' },
  VIEW: { icon: Grip, label: 'View' },
  TABLE_PATTERN: { icon: Asterisk, label: 'Pattern' },
  CONNECTOR: { icon: Plug, label: 'Connector' },
}

/** Two ways out of OWOX that are not data destinations, but read as one on this canvas. */
export const AI_MARK: Mark = Sparkles
export const API_MARK: Mark = KeyRound
