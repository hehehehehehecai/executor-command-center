export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  app_private: {
    Tables: {
      database_baseline: {
        Row: {
          contract_version: string
          created_at: string
          id: string
          logical_migration_id: string
          seed_marker: string
        }
        Insert: {
          contract_version: string
          created_at?: string
          id: string
          logical_migration_id: string
          seed_marker: string
        }
        Update: {
          contract_version?: string
          created_at?: string
          id?: string
          logical_migration_id?: string
          seed_marker?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      utf16_code_units: { Args: { value: string }; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      github_commits: {
        Row: {
          author_login: string | null
          authored_at: string | null
          committed_at: string
          created_at: string
          github_object_id: string
          id: string
          message: string
          project_id: string
          source_updated_at: string
          source_version: string
          updated_at: string
        }
        Insert: {
          author_login?: string | null
          authored_at?: string | null
          committed_at: string
          created_at?: string
          github_object_id: string
          id?: string
          message: string
          project_id: string
          source_updated_at: string
          source_version: string
          updated_at?: string
        }
        Update: {
          author_login?: string | null
          authored_at?: string | null
          committed_at?: string
          created_at?: string
          github_object_id?: string
          id?: string
          message?: string
          project_id?: string
          source_updated_at?: string
          source_version?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_commits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      github_document_snapshots: {
        Row: {
          content_fingerprint: string
          created_at: string
          document_kind: string
          document_path: string
          github_object_id: string
          id: string
          project_id: string
          source_updated_at: string
          source_version: string
          updated_at: string
        }
        Insert: {
          content_fingerprint: string
          created_at?: string
          document_kind: string
          document_path: string
          github_object_id: string
          id?: string
          project_id: string
          source_updated_at: string
          source_version: string
          updated_at?: string
        }
        Update: {
          content_fingerprint?: string
          created_at?: string
          document_kind?: string
          document_path?: string
          github_object_id?: string
          id?: string
          project_id?: string
          source_updated_at?: string
          source_version?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_document_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      github_identities: {
        Row: {
          avatar_url: string | null
          created_at: string
          github_login: string
          github_user_id: number
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          github_login: string
          github_user_id: number
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          github_login?: string
          github_user_id?: number
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_identities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      github_installation_states: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          return_to: string
          state_hash: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          return_to: string
          state_hash: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          return_to?: string
          state_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_installation_states_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      github_installations: {
        Row: {
          account_type: string
          created_at: string
          github_account_id: number
          github_account_login: string
          id: string
          installation_id: number
          last_verified_at: string
          repository_selection: string
          revoked_at: string | null
          status: string
          suspended_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type: string
          created_at?: string
          github_account_id: number
          github_account_login: string
          id?: string
          installation_id: number
          last_verified_at: string
          repository_selection: string
          revoked_at?: string | null
          status: string
          suspended_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type?: string
          created_at?: string
          github_account_id?: number
          github_account_login?: string
          id?: string
          installation_id?: number
          last_verified_at?: string
          repository_selection?: string
          revoked_at?: string | null
          status?: string
          suspended_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_installations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      github_issues: {
        Row: {
          author_login: string | null
          closed_at: string | null
          created_at: string
          github_object_id: string
          id: string
          issue_number: number
          project_id: string
          source_updated_at: string
          source_version: string
          state: string
          title: string
          updated_at: string
        }
        Insert: {
          author_login?: string | null
          closed_at?: string | null
          created_at?: string
          github_object_id: string
          id?: string
          issue_number: number
          project_id: string
          source_updated_at: string
          source_version: string
          state: string
          title: string
          updated_at?: string
        }
        Update: {
          author_login?: string | null
          closed_at?: string | null
          created_at?: string
          github_object_id?: string
          id?: string
          issue_number?: number
          project_id?: string
          source_updated_at?: string
          source_version?: string
          state?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_issues_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      github_pull_requests: {
        Row: {
          base_ref: string
          created_at: string
          github_object_id: string
          head_sha: string
          id: string
          is_draft: boolean
          merged_at: string | null
          project_id: string
          pull_request_number: number
          source_updated_at: string
          source_version: string
          state: string
          title: string
          updated_at: string
        }
        Insert: {
          base_ref: string
          created_at?: string
          github_object_id: string
          head_sha: string
          id?: string
          is_draft: boolean
          merged_at?: string | null
          project_id: string
          pull_request_number: number
          source_updated_at: string
          source_version: string
          state: string
          title: string
          updated_at?: string
        }
        Update: {
          base_ref?: string
          created_at?: string
          github_object_id?: string
          head_sha?: string
          id?: string
          is_draft?: boolean
          merged_at?: string | null
          project_id?: string
          pull_request_number?: number
          source_updated_at?: string
          source_version?: string
          state?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_pull_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      github_releases: {
        Row: {
          created_at: string
          github_object_id: string
          id: string
          is_draft: boolean
          is_prerelease: boolean
          name: string | null
          project_id: string
          published_at: string | null
          source_updated_at: string
          source_version: string
          tag_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          github_object_id: string
          id?: string
          is_draft: boolean
          is_prerelease: boolean
          name?: string | null
          project_id: string
          published_at?: string | null
          source_updated_at: string
          source_version: string
          tag_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          github_object_id?: string
          id?: string
          is_draft?: boolean
          is_prerelease?: boolean
          name?: string | null
          project_id?: string
          published_at?: string | null
          source_updated_at?: string
          source_version?: string
          tag_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_releases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      github_repository_snapshots: {
        Row: {
          created_at: string
          default_branch: string
          github_object_id: string
          id: string
          is_archived: boolean
          is_disabled: boolean
          is_fork: boolean
          is_private: boolean
          project_id: string
          repository_full_name: string
          source_updated_at: string
          source_version: string
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          default_branch: string
          github_object_id: string
          id?: string
          is_archived: boolean
          is_disabled: boolean
          is_fork: boolean
          is_private: boolean
          project_id: string
          repository_full_name: string
          source_updated_at: string
          source_version: string
          updated_at?: string
          visibility: string
        }
        Update: {
          created_at?: string
          default_branch?: string
          github_object_id?: string
          id?: string
          is_archived?: boolean
          is_disabled?: boolean
          is_fork?: boolean
          is_private?: boolean
          project_id?: string
          repository_full_name?: string
          source_updated_at?: string
          source_version?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_repository_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      github_workflow_runs: {
        Row: {
          conclusion: string | null
          created_at: string
          event_name: string
          github_object_id: string
          head_sha: string
          id: string
          project_id: string
          run_number: number
          source_updated_at: string
          source_version: string
          status: string
          updated_at: string
          workflow_id: string
        }
        Insert: {
          conclusion?: string | null
          created_at?: string
          event_name: string
          github_object_id: string
          head_sha: string
          id?: string
          project_id: string
          run_number: number
          source_updated_at: string
          source_version: string
          status: string
          updated_at?: string
          workflow_id: string
        }
        Update: {
          conclusion?: string | null
          created_at?: string
          event_name?: string
          github_object_id?: string
          head_sha?: string
          id?: string
          project_id?: string
          run_number?: number
          source_updated_at?: string
          source_version?: string
          status?: string
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_workflow_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          core_goal: string
          created_at: string
          current_blocker: string | null
          current_stage_goal: string
          id: string
          selected_repository_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          core_goal: string
          created_at?: string
          current_blocker?: string | null
          current_stage_goal: string
          id?: string
          selected_repository_id: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          core_goal?: string
          created_at?: string
          current_blocker?: string | null
          current_stage_goal?: string
          id?: string
          selected_repository_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_selected_repository_id_fkey"
            columns: ["selected_repository_id"]
            isOneToOne: false
            referencedRelation: "selected_repositories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      selected_repositories: {
        Row: {
          created_at: string
          default_branch: string
          full_name: string
          github_installation_id: string
          github_repository_id: number
          id: string
          is_archived: boolean
          is_disabled: boolean
          is_fork: boolean
          is_private: boolean
          name: string
          owner_login: string
          selected_at: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          created_at?: string
          default_branch: string
          full_name: string
          github_installation_id: string
          github_repository_id: number
          id?: string
          is_archived: boolean
          is_disabled: boolean
          is_fork: boolean
          is_private: boolean
          name: string
          owner_login: string
          selected_at?: string
          updated_at?: string
          user_id: string
          visibility: string
        }
        Update: {
          created_at?: string
          default_branch?: string
          full_name?: string
          github_installation_id?: string
          github_repository_id?: number
          id?: string
          is_archived?: boolean
          is_disabled?: boolean
          is_fork?: boolean
          is_private?: boolean
          name?: string
          owner_login?: string
          selected_at?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "selected_repositories_github_installation_id_fkey"
            columns: ["github_installation_id"]
            isOneToOne: false
            referencedRelation: "github_installations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selected_repositories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_runs: {
        Row: {
          created_at: string
          error_code: string | null
          error_summary: string | null
          finished_at: string | null
          id: string
          idempotency_key: string
          last_progress_at: string | null
          progress_cursor: string | null
          project_id: string
          queued_at: string
          started_at: string | null
          status: string
          trigger_source: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key: string
          last_progress_at?: string | null
          progress_cursor?: string | null
          project_id: string
          queued_at?: string
          started_at?: string | null
          status?: string
          trigger_source: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          error_code?: string | null
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string
          last_progress_at?: string | null
          progress_cursor?: string | null
          project_id?: string
          queued_at?: string
          started_at?: string | null
          status?: string
          trigger_source?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sync_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_github_installation_state: {
        Args: { p_state_hash: string; p_user_id: string }
        Returns: string
      }
      create_github_installation_state: {
        Args: {
          p_expires_at: string
          p_return_to: string
          p_state_hash: string
          p_user_id: string
        }
        Returns: string
      }
      create_sync_run: {
        Args: {
          p_idempotency_key: string
          p_project_id: string
          p_trigger_source: string
        }
        Returns: Json
      }
      ensure_selected_github_repository: {
        Args: {
          p_default_branch: string
          p_full_name: string
          p_github_installation_id: string
          p_github_repository_id: number
          p_is_archived: boolean
          p_is_disabled: boolean
          p_is_fork: boolean
          p_is_private: boolean
          p_name: string
          p_owner_login: string
          p_user_id: string
          p_visibility: string
        }
        Returns: {
          created_at: string
          default_branch: string
          full_name: string
          github_installation_id: string
          github_repository_id: number
          id: string
          is_archived: boolean
          is_disabled: boolean
          is_fork: boolean
          is_private: boolean
          name: string
          owner_login: string
          selected_at: string
          updated_at: string
          user_id: string
          visibility: string
        }
        SetofOptions: {
          from: "*"
          to: "selected_repositories"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_user_identity: {
        Args: {
          p_auth_user_id: string
          p_avatar_url: string
          p_github_login: string
          p_github_user_id: number
        }
        Returns: string
      }
      get_latest_sync_run: { Args: { p_project_id: string }; Returns: Json }
      read_current_github_identity: {
        Args: { p_user_id: string }
        Returns: number
      }
      read_current_github_installation: {
        Args: { p_user_id: string }
        Returns: {
          installation_id: number
          repository_selection: string
          status: string
        }[]
      }
      read_current_github_selection_installation: {
        Args: { p_user_id: string }
        Returns: {
          id: string
          installation_id: number
          status: string
        }[]
      }
      register_verified_github_installation: {
        Args: {
          p_account_type: string
          p_github_account_id: number
          p_github_account_login: string
          p_installation_id: number
          p_repository_selection: string
          p_status: string
          p_suspended_at: string
          p_user_id: string
          p_verified_at: string
        }
        Returns: string
      }
      remove_selected_github_repository: {
        Args: { p_github_repository_id: number; p_user_id: string }
        Returns: undefined
      }
      save_project_calibration: {
        Args: {
          p_core_goal: string
          p_current_blocker: string
          p_current_stage_goal: string
          p_selected_repository_id: string
          p_status: string
          p_user_id: string
        }
        Returns: Json
      }
      transition_sync_run: {
        Args: {
          p_error_code: string
          p_error_summary: string
          p_expected_status: string
          p_expected_version: number
          p_progress_cursor: string
          p_project_id: string
          p_run_id: string
          p_target_status: string
          p_transitioned_at: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  app_private: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
