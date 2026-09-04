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
      beta_rate_limit_buckets: {
        Row: {
          request_count: number
          scope: string
          subject_fingerprint: string
          updated_at: string
          window_started_at: string
        }
        Insert: {
          request_count: number
          scope: string
          subject_fingerprint: string
          updated_at: string
          window_started_at: string
        }
        Update: {
          request_count?: number
          scope?: string
          subject_fingerprint?: string
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
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
      account_deletion_result: {
        Args: {
          operation: Database["public"]["Tables"]["account_deletion_operations"]["Row"]
          p_outcome: string
        }
        Returns: Json
      }
      available_energy: {
        Args: { p_business_date: string; p_user_id: string }
        Returns: number
      }
      first_sync_cursor_is_valid: {
        Args: {
          cursor_value: string
          expected_project_id: string
          expected_run_id: string
        }
        Returns: boolean
      }
      lock_account_write_gate: {
        Args: { p_user_id: string }
        Returns: undefined
      }
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
      account_deletion_operations: {
        Row: {
          auth_delete_outcome: string | null
          auth_receipt_fingerprint: string | null
          business_deleted_at: string | null
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          due_at: string | null
          failed_at: string | null
          failure_code: string | null
          idempotency_key: string | null
          lease_expires_at: string | null
          lease_token: string | null
          operation_id: string | null
          recovery_dispatch_attempts: number
          recovery_dispatch_lease_expires_at: string | null
          recovery_dispatch_token: string | null
          recovery_dispatched_at: string | null
          recovery_eligible_at: string | null
          recovery_generation: number
          recovery_last_error_code: string | null
          requested_at: string | null
          retry_count: number
          retry_exhausted_at: string | null
          retry_exhausted_count: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_delete_outcome?: string | null
          auth_receipt_fingerprint?: string | null
          business_deleted_at?: string | null
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          failed_at?: string | null
          failure_code?: string | null
          idempotency_key?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          operation_id?: string | null
          recovery_dispatch_attempts?: number
          recovery_dispatch_lease_expires_at?: string | null
          recovery_dispatch_token?: string | null
          recovery_dispatched_at?: string | null
          recovery_eligible_at?: string | null
          recovery_generation?: number
          recovery_last_error_code?: string | null
          requested_at?: string | null
          retry_count?: number
          retry_exhausted_at?: string | null
          retry_exhausted_count?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_delete_outcome?: string | null
          auth_receipt_fingerprint?: string | null
          business_deleted_at?: string | null
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          failed_at?: string | null
          failure_code?: string | null
          idempotency_key?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          operation_id?: string | null
          recovery_dispatch_attempts?: number
          recovery_dispatch_lease_expires_at?: string | null
          recovery_dispatch_token?: string | null
          recovery_dispatched_at?: string | null
          recovery_eligible_at?: string | null
          recovery_generation?: number
          recovery_last_error_code?: string | null
          requested_at?: string | null
          retry_count?: number
          retry_exhausted_at?: string | null
          retry_exhausted_count?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_invocations: {
        Row: {
          brief_id: string | null
          cache_equivalence_fingerprint: string | null
          cache_status: string | null
          completed_at: string | null
          cost_microunits: number | null
          created_at: string
          error_code: string | null
          failure_stage: string | null
          feature: string
          id: string
          input_fingerprint: string | null
          input_tokens: number | null
          latency_ms: number | null
          model: string | null
          output_tokens: number | null
          project_id: string
          prompt_version: string | null
          provider: string | null
          provider_request_id: string | null
          reservation_id: string | null
          schema_version: string | null
          source_invocation_id: string | null
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          brief_id?: string | null
          cache_equivalence_fingerprint?: string | null
          cache_status?: string | null
          completed_at?: string | null
          cost_microunits?: number | null
          created_at?: string
          error_code?: string | null
          failure_stage?: string | null
          feature: string
          id?: string
          input_fingerprint?: string | null
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          project_id: string
          prompt_version?: string | null
          provider?: string | null
          provider_request_id?: string | null
          reservation_id?: string | null
          schema_version?: string | null
          source_invocation_id?: string | null
          started_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          brief_id?: string | null
          cache_equivalence_fingerprint?: string | null
          cache_status?: string | null
          completed_at?: string | null
          cost_microunits?: number | null
          created_at?: string
          error_code?: string | null
          failure_stage?: string | null
          feature?: string
          id?: string
          input_fingerprint?: string | null
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          project_id?: string
          prompt_version?: string | null
          provider?: string | null
          provider_request_id?: string | null
          reservation_id?: string | null
          schema_version?: string | null
          source_invocation_id?: string | null
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_invocations_brief_owner_fkey"
            columns: ["brief_id", "user_id", "project_id"]
            isOneToOne: false
            referencedRelation: "project_briefs"
            referencedColumns: ["id", "user_id", "project_id"]
          },
          {
            foreignKeyName: "ai_invocations_project_owner_fkey"
            columns: ["project_id", "user_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "ai_invocations_reservation_owner_fkey"
            columns: ["reservation_id", "user_id", "project_id"]
            isOneToOne: false
            referencedRelation: "energy_reservations"
            referencedColumns: ["id", "user_id", "project_id"]
          },
          {
            foreignKeyName: "ai_invocations_source_owner_fkey"
            columns: ["source_invocation_id", "user_id", "project_id"]
            isOneToOne: false
            referencedRelation: "ai_invocations"
            referencedColumns: ["id", "user_id", "project_id"]
          },
          {
            foreignKeyName: "ai_invocations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      energy_ledger_entries: {
        Row: {
          amount: number
          business_date: string
          created_at: string
          delta: number
          entry_type: string
          id: string
          idempotency_key: string
          invocation_id: string | null
          metadata: Json
          project_id: string | null
          project_reference_removed_at: string | null
          repository_removal_operation_id: string | null
          reservation_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          business_date: string
          created_at?: string
          delta: number
          entry_type: string
          id?: string
          idempotency_key: string
          invocation_id?: string | null
          metadata?: Json
          project_id?: string | null
          project_reference_removed_at?: string | null
          repository_removal_operation_id?: string | null
          reservation_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          business_date?: string
          created_at?: string
          delta?: number
          entry_type?: string
          id?: string
          idempotency_key?: string
          invocation_id?: string | null
          metadata?: Json
          project_id?: string | null
          project_reference_removed_at?: string | null
          repository_removal_operation_id?: string | null
          reservation_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "energy_ledger_entries_invocation_id_fkey"
            columns: ["invocation_id"]
            isOneToOne: false
            referencedRelation: "ai_invocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_ledger_entries_project_owner_fkey"
            columns: ["project_id", "user_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "energy_ledger_entries_repository_removal_operation_id_fkey"
            columns: ["repository_removal_operation_id"]
            isOneToOne: false
            referencedRelation: "repository_removal_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_ledger_entries_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "energy_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_ledger_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      energy_reservations: {
        Row: {
          amount: number
          business_date: string
          consumed_at: string | null
          created_at: string
          error_code: string | null
          failure_stage: string | null
          id: string
          project_id: string
          released_at: string | null
          request_key: string
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          business_date: string
          consumed_at?: string | null
          created_at?: string
          error_code?: string | null
          failure_stage?: string | null
          id?: string
          project_id: string
          released_at?: string | null
          request_key: string
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          business_date?: string
          consumed_at?: string | null
          created_at?: string
          error_code?: string | null
          failure_stage?: string | null
          id?: string
          project_id?: string
          released_at?: string | null
          request_key?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "energy_reservations_project_owner_fkey"
            columns: ["project_id", "user_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "energy_reservations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_reference_invalidations: {
        Row: {
          id: string
          invalidated_at: string
          invalidation_reason: string
          reference_fingerprint: string
          repository_removal_operation_id: string
          source_id: string
          source_kind: string
          source_version: string | null
          target_project_id: string
          user_id: string
        }
        Insert: {
          id?: string
          invalidated_at: string
          invalidation_reason?: string
          reference_fingerprint: string
          repository_removal_operation_id: string
          source_id: string
          source_kind: string
          source_version?: string | null
          target_project_id: string
          user_id: string
        }
        Update: {
          id?: string
          invalidated_at?: string
          invalidation_reason?: string
          reference_fingerprint?: string
          repository_removal_operation_id?: string
          source_id?: string
          source_kind?: string
          source_version?: string | null
          target_project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_reference_invalidati_repository_removal_operation_fkey"
            columns: ["repository_removal_operation_id"]
            isOneToOne: false
            referencedRelation: "repository_removal_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_reference_invalidations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
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
      github_webhook_deliveries: {
        Row: {
          action: string | null
          body_sha256: string
          created_at: string
          delivery_id: string
          dispatch_lease_until: string | null
          event_name: string
          id: string
          installation_id: number | null
          internal_event_id: string
          processing_lease_until: string | null
          project_id: string | null
          provider_receipt_id: string | null
          received_at: string
          repository_full_name: string | null
          repository_id: number | null
          safe_error_code: string | null
          status: string
          sync_run_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          action?: string | null
          body_sha256: string
          created_at?: string
          delivery_id: string
          dispatch_lease_until?: string | null
          event_name: string
          id?: string
          installation_id?: number | null
          internal_event_id: string
          processing_lease_until?: string | null
          project_id?: string | null
          provider_receipt_id?: string | null
          received_at: string
          repository_full_name?: string | null
          repository_id?: number | null
          safe_error_code?: string | null
          status: string
          sync_run_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          action?: string | null
          body_sha256?: string
          created_at?: string
          delivery_id?: string
          dispatch_lease_until?: string | null
          event_name?: string
          id?: string
          installation_id?: number | null
          internal_event_id?: string
          processing_lease_until?: string | null
          project_id?: string | null
          provider_receipt_id?: string | null
          received_at?: string
          repository_full_name?: string | null
          repository_id?: number | null
          safe_error_code?: string | null
          status?: string
          sync_run_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "github_webhook_deliveries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "github_webhook_deliveries_sync_run_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "sync_runs"
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
      project_briefs: {
        Row: {
          cache_equivalence_fingerprint: string | null
          completed_at: string | null
          created_at: string
          error_code: string | null
          evidence_fingerprint: string | null
          expires_at: string | null
          failure_stage: string | null
          id: string
          payload: Json | null
          payload_fingerprint: string | null
          project_id: string
          prompt_version: string | null
          range_end: string
          range_start: string
          schema_version: string | null
          status: string
          user_id: string
        }
        Insert: {
          cache_equivalence_fingerprint?: string | null
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          evidence_fingerprint?: string | null
          expires_at?: string | null
          failure_stage?: string | null
          id?: string
          payload?: Json | null
          payload_fingerprint?: string | null
          project_id: string
          prompt_version?: string | null
          range_end: string
          range_start: string
          schema_version?: string | null
          status?: string
          user_id: string
        }
        Update: {
          cache_equivalence_fingerprint?: string | null
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          evidence_fingerprint?: string | null
          expires_at?: string | null
          failure_stage?: string | null
          id?: string
          payload?: Json | null
          payload_fingerprint?: string | null
          project_id?: string
          prompt_version?: string | null
          range_end?: string
          range_start?: string
          schema_version?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_briefs_project_owner_fkey"
            columns: ["project_id", "user_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "project_briefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      project_sync_dispatches: {
        Row: {
          cancelled_at: string | null
          created_at: string
          dispatch_status: string
          dispatched_at: string | null
          id: string
          lease_expires_at: string | null
          project_id: string
          provider_job_id: string | null
          request_identity: string
          requested_at: string
          safe_error_code: string | null
          sync_run_id: string
          trigger_source: string
          updated_at: string
          version: number
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          dispatch_status?: string
          dispatched_at?: string | null
          id?: string
          lease_expires_at?: string | null
          project_id: string
          provider_job_id?: string | null
          request_identity: string
          requested_at: string
          safe_error_code?: string | null
          sync_run_id: string
          trigger_source: string
          updated_at?: string
          version?: number
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          dispatch_status?: string
          dispatched_at?: string | null
          id?: string
          lease_expires_at?: string | null
          project_id?: string
          provider_job_id?: string | null
          request_identity?: string
          requested_at?: string
          safe_error_code?: string | null
          sync_run_id?: string
          trigger_source?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_sync_dispatches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_sync_dispatches_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: true
            referencedRelation: "sync_runs"
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
          repository_data_state: string
          repository_data_version: number
          repository_removed_at: string | null
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
          repository_data_state?: string
          repository_data_version?: number
          repository_removed_at?: string | null
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
          repository_data_state?: string
          repository_data_version?: number
          repository_removed_at?: string | null
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
      repository_removal_operations: {
        Row: {
          completed_at: string | null
          created_at: string
          error_code: string | null
          failure_stage: string | null
          id: string
          idempotency_key: string
          mode: string
          request_fingerprint: string
          result: Json | null
          safely_retryable: boolean
          status: string
          target_project_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          failure_stage?: string | null
          id?: string
          idempotency_key: string
          mode: string
          request_fingerprint: string
          result?: Json | null
          safely_retryable?: boolean
          status?: string
          target_project_id: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          failure_stage?: string | null
          id?: string
          idempotency_key?: string
          mode?: string
          request_fingerprint?: string
          result?: Json | null
          safely_retryable?: boolean
          status?: string
          target_project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repository_removal_operations_user_id_fkey"
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
      cancel_account_deletion: {
        Args: { p_actor_user_id: string; p_operation_id: string }
        Returns: Json
      }
      checkpoint_first_sync_run: {
        Args: {
          p_checkpointed_at: string
          p_expected_status: string
          p_expected_version: number
          p_progress_cursor: string
          p_project_id: string
          p_run_id: string
        }
        Returns: Json
      }
      claim_account_deletion: {
        Args: { p_lease_duration: string; p_operation_id: string }
        Returns: Json
      }
      claim_account_deletion_recoveries: {
        Args: { p_lease_duration: string; p_limit: number }
        Returns: Json
      }
      claim_github_webhook_dispatch: {
        Args: {
          p_claimed_at: string
          p_delivery_id: string
          p_expected_version: number
        }
        Returns: Json
      }
      claim_github_webhook_processing: {
        Args: {
          p_claimed_at: string
          p_delivery_id: string
          p_expected_version: number
          p_sync_run_id: string
        }
        Returns: Json
      }
      claim_project_sync_dispatch: {
        Args: {
          p_claimed_at: string
          p_expected_version: number
          p_project_id: string
          p_sync_run_id: string
        }
        Returns: Json
      }
      cleanup_account_business_data: {
        Args: { p_lease_token: string; p_operation_id: string }
        Returns: Json
      }
      complete_account_deletion: {
        Args: {
          p_error_code: string
          p_lease_token: string
          p_operation_id: string
          p_outcome: string
          p_receipt_fingerprint: string
        }
        Returns: Json
      }
      complete_account_deletion_recovery_dispatch: {
        Args: {
          p_dispatch_token: string
          p_error_code: string
          p_generation: number
          p_operation_id: string
          p_outcome: string
        }
        Returns: Json
      }
      complete_github_webhook_dispatch: {
        Args: {
          p_completed_at: string
          p_delivery_id: string
          p_expected_version: number
          p_provider_receipt_id: string
        }
        Returns: Json
      }
      complete_github_webhook_installation: {
        Args: {
          p_completed_at: string
          p_delivery_id: string
          p_expected_version: number
          p_installation_state: string
        }
        Returns: Json
      }
      complete_github_webhook_processing: {
        Args: {
          p_completed_at: string
          p_delivery_id: string
          p_expected_version: number
          p_sync_run_id: string
        }
        Returns: Json
      }
      complete_project_sync_dispatch: {
        Args: {
          p_completed_at: string
          p_expected_version: number
          p_project_id: string
          p_provider_job_id: string
          p_sync_run_id: string
        }
        Returns: Json
      }
      consume_beta_rate_limit: {
        Args: { p_scope: string }
        Returns: {
          allowed: boolean
          remaining: number
          retry_after_seconds: number
        }[]
      }
      consume_energy: { Args: { p_reservation_id: string }; Returns: Json }
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
      execute_repository_removal: {
        Args: {
          p_actor_user_id: string
          p_confirmation_project_id: string
          p_confirmation_text: string
          p_idempotency_key: string
          p_mode: string
          p_project_id: string
        }
        Returns: Json
      }
      fail_github_webhook_processing: {
        Args: {
          p_delivery_id: string
          p_expected_version: number
          p_failed_at: string
          p_safe_error_code: string
          p_sync_run_id: string
        }
        Returns: Json
      }
      fail_project_brief_generation:
        | {
            Args: {
              p_actor_user_id: string
              p_cache_equivalence_fingerprint: string
              p_error_code: string
              p_failure_stage: string
              p_input_fingerprint: string
              p_input_tokens: number
              p_latency_ms: number
              p_model: string
              p_output_tokens: number
              p_provider: string
              p_request_id: string
              p_reservation_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_actor_user_id: string
              p_error_code: string
              p_failure_stage: string
              p_input_fingerprint: string
              p_input_tokens: number
              p_latency_ms: number
              p_model: string
              p_output_tokens: number
              p_provider: string
              p_request_id: string
              p_reservation_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_actor_user_id: string
              p_error_code: string
              p_failure_stage: string
              p_input_tokens: number
              p_latency_ms: number
              p_model: string
              p_output_tokens: number
              p_provider: string
              p_request_id: string
              p_reservation_id: string
            }
            Returns: Json
          }
      fail_project_brief_generation_with_contract: {
        Args: {
          p_actor_user_id: string
          p_cache_equivalence_fingerprint: string
          p_error_code: string
          p_failure_stage: string
          p_input_fingerprint: string
          p_input_tokens: number
          p_latency_ms: number
          p_model: string
          p_output_tokens: number
          p_prompt_version: string
          p_provider: string
          p_request_id: string
          p_reservation_id: string
          p_schema_version: string
        }
        Returns: Json
      }
      finalize_project_brief_generation:
        | {
            Args: {
              p_actor_user_id: string
              p_cache_equivalence_fingerprint: string
              p_evidence_fingerprint: string
              p_expires_at: string
              p_input_tokens: number
              p_latency_ms: number
              p_model: string
              p_output_tokens: number
              p_payload: Json
              p_payload_fingerprint: string
              p_prompt_version: string
              p_provider: string
              p_range_end: string
              p_range_start: string
              p_request_id: string
              p_reservation_id: string
              p_schema_version: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_actor_user_id: string
              p_evidence_fingerprint: string
              p_expires_at: string
              p_input_tokens: number
              p_latency_ms: number
              p_model: string
              p_output_tokens: number
              p_payload: Json
              p_prompt_version: string
              p_provider: string
              p_range_end: string
              p_range_start: string
              p_request_id: string
              p_reservation_id: string
              p_schema_version: string
            }
            Returns: Json
          }
      get_account_deletion_status: {
        Args: { p_actor_user_id: string }
        Returns: Json
      }
      get_available_energy: {
        Args: { p_business_date: string }
        Returns: number
      }
      get_first_sync_run: {
        Args: { p_project_id: string; p_run_id: string }
        Returns: Json
      }
      get_latest_sync_run: { Args: { p_project_id: string }; Returns: Json }
      get_project_brief_generation_outcome: {
        Args: { p_reservation_id: string }
        Returns: Json
      }
      list_reconciliation_projects: {
        Args: { p_snapshot_since: string }
        Returns: Json
      }
      mark_account_deletion_retry_exhausted: {
        Args: { p_generation: number; p_operation_id: string }
        Returns: Json
      }
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
      read_first_sync_context: { Args: { p_project_id: string }; Returns: Json }
      record_project_brief_cache_hit: {
        Args: {
          p_actor_user_id: string
          p_brief_id: string
          p_cache_equivalence_fingerprint: string
          p_current_evidence_fingerprint: string
          p_observed_at: string
        }
        Returns: Json
      }
      register_github_webhook_delivery: {
        Args: {
          p_action: string
          p_body_sha256: string
          p_delivery_id: string
          p_event_name: string
          p_installation_id: number
          p_internal_event_id: string
          p_received_at: string
          p_repository_full_name: string
          p_repository_id: number
          p_supported: boolean
        }
        Returns: Json
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
      release_energy: { Args: { p_reservation_id: string }; Returns: Json }
      remove_selected_github_repository: {
        Args: { p_github_repository_id: number; p_user_id: string }
        Returns: undefined
      }
      request_account_deletion: {
        Args: {
          p_actor_user_id: string
          p_confirmation: string
          p_idempotency_key: string
        }
        Returns: Json
      }
      request_project_sync: {
        Args: {
          p_actor_user_id: string
          p_project_id: string
          p_request_identity: string
          p_requested_at: string
          p_trigger_source: string
        }
        Returns: Json
      }
      reserve_energy: {
        Args: {
          p_amount: number
          p_business_date: string
          p_project_id: string
          p_request_key: string
        }
        Returns: Json
      }
      reserve_project_brief_energy: {
        Args: { p_project_id: string; p_request_key: string }
        Returns: Json
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
      upsert_github_activity_snapshot_group: {
        Args: { p_group_name: string; p_items: Json; p_project_id: string }
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
