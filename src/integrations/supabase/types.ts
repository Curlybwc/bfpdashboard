export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          description: string | null
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          project_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          project_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_rules: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          id: string
          keywords: string[]
          match_mode: string
          name: string
          outcome_type: string
          outcome_user_id: string | null
          priority: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          id?: string
          keywords?: string[]
          match_mode?: string
          name: string
          outcome_type: string
          outcome_user_id?: string | null
          priority?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          id?: string
          keywords?: string[]
          match_mode?: string
          name?: string
          outcome_type?: string
          outcome_user_id?: string | null
          priority?: number
          updated_at?: string
        }
        Relationships: []
      }
      checklist_items: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          default_cost_item_id: string | null
          id: string
          label: string
          normalized_label: string
          sort_order: number
          template_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          default_cost_item_id?: string | null
          id?: string
          label: string
          normalized_label: string
          sort_order?: number
          template_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          default_cost_item_id?: string | null
          id?: string
          label?: string
          normalized_label?: string
          sort_order?: number
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_default_cost_item_id_fkey"
            columns: ["default_cost_item_id"]
            isOneToOne: false
            referencedRelation: "cost_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          org_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          org_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          org_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
          qb_connection_id: string | null
          short_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          qb_connection_id?: string | null
          short_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          qb_connection_id?: string | null
          short_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_qb_connection_id_fkey"
            columns: ["qb_connection_id"]
            isOneToOne: false
            referencedRelation: "quickbooks_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_items: {
        Row: {
          active: boolean
          created_at: string
          default_total_cost: number
          id: string
          name: string
          normalized_name: string | null
          org_id: string | null
          piece_length_ft: number | null
          unit_type: Database["public"]["Enums"]["unit_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_total_cost?: number
          id?: string
          name: string
          normalized_name?: string | null
          org_id?: string | null
          piece_length_ft?: number | null
          unit_type?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_total_cost?: number
          id?: string
          name?: string
          normalized_name?: string | null
          org_id?: string | null
          piece_length_ft?: number | null
          unit_type?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_group_members: {
        Row: {
          created_at: string
          crew_group_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          crew_group_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          crew_group_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_group_members_crew_group_id_fkey"
            columns: ["crew_group_id"]
            isOneToOne: false
            referencedRelation: "crew_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_groups: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      field_captures: {
        Row: {
          ai_output: Json | null
          created_at: string
          created_by: string
          error: string | null
          id: string
          include_materials: boolean
          parse_status: string
          project_id: string
          raw_text: string
        }
        Insert: {
          ai_output?: Json | null
          created_at?: string
          created_by: string
          error?: string | null
          id?: string
          include_materials?: boolean
          parse_status?: string
          project_id: string
          raw_text: string
        }
        Update: {
          ai_output?: Json | null
          created_at?: string
          created_by?: string
          error?: string | null
          id?: string
          include_materials?: boolean
          parse_status?: string
          project_id?: string
          raw_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_captures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      material_inventory: {
        Row: {
          created_at: string
          id: string
          location_type: string
          name: string
          project_id: string | null
          qty: number
          sku: string | null
          status: string
          unit: string | null
          updated_at: string
          updated_by: string | null
          vendor_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          location_type: string
          name: string
          project_id?: string | null
          qty: number
          sku?: string | null
          status?: string
          unit?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          location_type?: string
          name?: string
          project_id?: string | null
          qty?: number
          sku?: string | null
          status?: string
          unit?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_inventory_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_inventory_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      material_library: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          normalized_name: string
          org_id: string | null
          sku: string | null
          store_section: string | null
          unit: string | null
          unit_cost: number | null
          updated_at: string
          vendor_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          normalized_name: string
          org_id?: string | null
          sku?: string | null
          store_section?: string | null
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string
          vendor_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          normalized_name?: string
          org_id?: string | null
          sku?: string | null
          store_section?: string | null
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string
          vendor_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_library_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invites: {
        Row: {
          accepted_at: string | null
          accepted_by_user_id: string | null
          email: string
          expires_at: string
          id: string
          invited_at: string
          invited_by: string | null
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payout_runs: {
        Row: {
          created_at: string
          created_by: string
          id: string
          notes: string | null
          payout_date: string | null
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["payout_run_status"]
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          payout_date?: string | null
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["payout_run_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          payout_date?: string | null
          period_end?: string
          period_start?: string
          status?: Database["public"]["Enums"]["payout_run_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_aliases: {
        Row: {
          alias: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          alias: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          alias?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_aliases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          can_manage_projects: boolean
          created_at: string
          dd_on_file: boolean
          full_name: string | null
          hourly_rate: number | null
          id: string
          is_active: boolean
          is_admin: boolean
          org_id: string | null
          skip_qb_export: boolean
          tax_info_filed: boolean
        }
        Insert: {
          can_manage_projects?: boolean
          created_at?: string
          dd_on_file?: boolean
          full_name?: string | null
          hourly_rate?: number | null
          id: string
          is_active?: boolean
          is_admin?: boolean
          org_id?: string | null
          skip_qb_export?: boolean
          tax_info_filed?: boolean
        }
        Update: {
          can_manage_projects?: boolean
          created_at?: string
          dd_on_file?: boolean
          full_name?: string | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          is_admin?: boolean
          org_id?: string | null
          skip_qb_export?: boolean
          tax_info_filed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          project_id: string
          role: Database["public"]["Enums"]["project_member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          role?: Database["public"]["Enums"]["project_member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          role?: Database["public"]["Enums"]["project_member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          address: string | null
          company_id: string | null
          created_at: string
          has_missing_estimates: boolean
          id: string
          name: string
          org_id: string | null
          project_type: Database["public"]["Enums"]["project_type"]
          scope_id: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_id?: string | null
          created_at?: string
          has_missing_estimates?: boolean
          id?: string
          name: string
          org_id?: string | null
          project_type?: Database["public"]["Enums"]["project_type"]
          scope_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_id?: string | null
          created_at?: string
          has_missing_estimates?: boolean
          id?: string
          name?: string
          org_id?: string | null
          project_type?: Database["public"]["Enums"]["project_type"]
          scope_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "scopes"
            referencedColumns: ["id"]
          },
        ]
      }
      quickbooks_class_mappings: {
        Row: {
          created_at: string
          id: string
          project_id: string
          qb_class_id: string
          qb_class_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          qb_class_id: string
          qb_class_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          qb_class_id?: string
          qb_class_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quickbooks_class_mappings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      quickbooks_connections: {
        Row: {
          access_token: string
          company_name: string | null
          connected_at: string
          connected_by: string
          disconnected_at: string | null
          id: string
          realm_id: string
          refresh_token: string
          token_expires_at: string
        }
        Insert: {
          access_token: string
          company_name?: string | null
          connected_at?: string
          connected_by: string
          disconnected_at?: string | null
          id?: string
          realm_id: string
          refresh_token: string
          token_expires_at: string
        }
        Update: {
          access_token?: string
          company_name?: string | null
          connected_at?: string
          connected_by?: string
          disconnected_at?: string | null
          id?: string
          realm_id?: string
          refresh_token?: string
          token_expires_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quickbooks_connections_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quickbooks_settings: {
        Row: {
          company_id: string | null
          id: string
          labor_expense_account_id: string | null
          labor_expense_account_name: string | null
          qb_reimbursement_expense_account_id: string | null
          qb_reimbursement_expense_account_name: string | null
          singleton: boolean
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          id?: string
          labor_expense_account_id?: string | null
          labor_expense_account_name?: string | null
          qb_reimbursement_expense_account_id?: string | null
          qb_reimbursement_expense_account_name?: string | null
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          id?: string
          labor_expense_account_id?: string | null
          labor_expense_account_name?: string | null
          qb_reimbursement_expense_account_id?: string | null
          qb_reimbursement_expense_account_name?: string | null
          singleton?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quickbooks_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      quickbooks_vendor_mappings: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          qb_vendor_id: string
          qb_vendor_name: string | null
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          qb_vendor_id: string
          qb_vendor_name?: string | null
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          qb_vendor_id?: string
          qb_vendor_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quickbooks_vendor_mappings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quickbooks_vendor_mappings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rehab_library: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          created_by: string
          id: string
          keywords: string[] | null
          name: string
          org_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          created_by: string
          id?: string
          keywords?: string[] | null
          name: string
          org_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          created_by?: string
          id?: string
          keywords?: string[] | null
          name?: string
          org_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rehab_library_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rehab_library_items: {
        Row: {
          created_at: string
          default_status: string
          description: string
          id: string
          library_id: string
          recipe_hint_id: string | null
          sort_order: number
          trade: string | null
        }
        Insert: {
          created_at?: string
          default_status?: string
          description: string
          id?: string
          library_id: string
          recipe_hint_id?: string | null
          sort_order?: number
          trade?: string | null
        }
        Update: {
          created_at?: string
          default_status?: string
          description?: string
          id?: string
          library_id?: string
          recipe_hint_id?: string | null
          sort_order?: number
          trade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rehab_library_items_library_id_fkey"
            columns: ["library_id"]
            isOneToOne: false
            referencedRelation: "rehab_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rehab_library_items_recipe_hint_id_fkey"
            columns: ["recipe_hint_id"]
            isOneToOne: false
            referencedRelation: "task_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      reimbursement_requests: {
        Row: {
          admin_notes: string | null
          approved_amount: number | null
          approved_at: string | null
          approved_by: string | null
          company_id: string | null
          contractor_response: string | null
          created_at: string
          created_by: string
          description: string
          expense_date: string
          external_reference: string | null
          id: string
          info_request_note: string | null
          marked_paid_by: string | null
          on_behalf_of_user_id: string | null
          org_id: string
          paid_at: string | null
          project_id: string | null
          qb_bill_doc_number: string | null
          qb_bill_id: string | null
          qb_export_error: string | null
          qb_exported_at: string | null
          receipt_paths: string[]
          rejection_reason: string | null
          requested_amount: number
          settlement_method: string | null
          status: Database["public"]["Enums"]["reimbursement_status"]
          submitter_user_id: string
          updated_at: string
          vendor_paid: string
        }
        Insert: {
          admin_notes?: string | null
          approved_amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string | null
          contractor_response?: string | null
          created_at?: string
          created_by: string
          description: string
          expense_date: string
          external_reference?: string | null
          id?: string
          info_request_note?: string | null
          marked_paid_by?: string | null
          on_behalf_of_user_id?: string | null
          org_id: string
          paid_at?: string | null
          project_id?: string | null
          qb_bill_doc_number?: string | null
          qb_bill_id?: string | null
          qb_export_error?: string | null
          qb_exported_at?: string | null
          receipt_paths?: string[]
          rejection_reason?: string | null
          requested_amount: number
          settlement_method?: string | null
          status?: Database["public"]["Enums"]["reimbursement_status"]
          submitter_user_id: string
          updated_at?: string
          vendor_paid: string
        }
        Update: {
          admin_notes?: string | null
          approved_amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string | null
          contractor_response?: string | null
          created_at?: string
          created_by?: string
          description?: string
          expense_date?: string
          external_reference?: string | null
          id?: string
          info_request_note?: string | null
          marked_paid_by?: string | null
          on_behalf_of_user_id?: string | null
          org_id?: string
          paid_at?: string | null
          project_id?: string | null
          qb_bill_doc_number?: string | null
          qb_bill_id?: string | null
          qb_export_error?: string | null
          qb_exported_at?: string | null
          receipt_paths?: string[]
          rejection_reason?: string | null
          requested_amount?: number
          settlement_method?: string | null
          status?: Database["public"]["Enums"]["reimbursement_status"]
          submitter_user_id?: string
          updated_at?: string
          vendor_paid?: string
        }
        Relationships: []
      }
      scope_checklist_reviews: {
        Row: {
          checklist_item_id: string
          id: string
          notes: string | null
          scope_id: string
          state: string
          updated_at: string
        }
        Insert: {
          checklist_item_id: string
          id?: string
          notes?: string | null
          scope_id: string
          state: string
          updated_at?: string
        }
        Update: {
          checklist_item_id?: string
          id?: string
          notes?: string | null
          scope_id?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scope_checklist_reviews_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_checklist_reviews_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "scopes"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_items: {
        Row: {
          added_after_conversion: boolean
          computed_total: number | null
          cost_item_id: string | null
          created_at: string
          description: string
          estimated_hours: number | null
          estimated_labor_cost: number | null
          estimated_material_cost: number | null
          id: string
          notes: string | null
          phase_key: string | null
          pricing_status: Database["public"]["Enums"]["pricing_status"]
          qty: number | null
          recipe_hint_id: string | null
          scope_id: string
          status: string
          unit: string | null
          unit_cost_override: number | null
          updated_at: string
        }
        Insert: {
          added_after_conversion?: boolean
          computed_total?: number | null
          cost_item_id?: string | null
          created_at?: string
          description: string
          estimated_hours?: number | null
          estimated_labor_cost?: number | null
          estimated_material_cost?: number | null
          id?: string
          notes?: string | null
          phase_key?: string | null
          pricing_status?: Database["public"]["Enums"]["pricing_status"]
          qty?: number | null
          recipe_hint_id?: string | null
          scope_id: string
          status?: string
          unit?: string | null
          unit_cost_override?: number | null
          updated_at?: string
        }
        Update: {
          added_after_conversion?: boolean
          computed_total?: number | null
          cost_item_id?: string | null
          created_at?: string
          description?: string
          estimated_hours?: number | null
          estimated_labor_cost?: number | null
          estimated_material_cost?: number | null
          id?: string
          notes?: string | null
          phase_key?: string | null
          pricing_status?: Database["public"]["Enums"]["pricing_status"]
          qty?: number | null
          recipe_hint_id?: string | null
          scope_id?: string
          status?: string
          unit?: string | null
          unit_cost_override?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scope_items_cost_item_id_fkey"
            columns: ["cost_item_id"]
            isOneToOne: false
            referencedRelation: "cost_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_items_recipe_hint_id_fkey"
            columns: ["recipe_hint_id"]
            isOneToOne: false
            referencedRelation: "task_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_items_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "scopes"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["scope_member_role"]
          scope_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["scope_member_role"]
          scope_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["scope_member_role"]
          scope_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scope_members_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "scopes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scopes: {
        Row: {
          address: string
          baseline_locked_at: string | null
          checklist_template_id: string | null
          converted_at: string | null
          converted_project_id: string | null
          created_at: string
          created_by: string
          estimated_total_snapshot: number | null
          id: string
          name: string | null
          org_id: string
          status: Database["public"]["Enums"]["scope_status"]
          updated_at: string
        }
        Insert: {
          address: string
          baseline_locked_at?: string | null
          checklist_template_id?: string | null
          converted_at?: string | null
          converted_project_id?: string | null
          created_at?: string
          created_by: string
          estimated_total_snapshot?: number | null
          id?: string
          name?: string | null
          org_id: string
          status?: Database["public"]["Enums"]["scope_status"]
          updated_at?: string
        }
        Update: {
          address?: string
          baseline_locked_at?: string | null
          checklist_template_id?: string | null
          converted_at?: string | null
          converted_project_id?: string | null
          created_at?: string
          created_by?: string
          estimated_total_snapshot?: number | null
          id?: string
          name?: string | null
          org_id?: string
          status?: Database["public"]["Enums"]["scope_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scopes_checklist_template_id_fkey"
            columns: ["checklist_template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scopes_converted_project_id_fkey"
            columns: ["converted_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scopes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_task_allocations: {
        Row: {
          hours: number
          id: string
          shift_id: string
          task_id: string
        }
        Insert: {
          hours: number
          id?: string
          shift_id: string
          task_id: string
        }
        Update: {
          hours?: number
          id?: string
          shift_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_task_allocations_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_task_allocations_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          admin_edited_at: string | null
          admin_edited_by: string | null
          clock_in_at: string | null
          clock_out_at: string | null
          created_at: string
          created_by: string | null
          end_time: string | null
          flat_rate_amount: number | null
          hourly_rate_snapshot: number | null
          id: string
          is_flat_rate: boolean
          project_id: string | null
          shift_date: string
          start_time: string | null
          total_hours: number | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          admin_edited_at?: string | null
          admin_edited_by?: string | null
          clock_in_at?: string | null
          clock_out_at?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          flat_rate_amount?: number | null
          hourly_rate_snapshot?: number | null
          id?: string
          is_flat_rate?: boolean
          project_id?: string | null
          shift_date: string
          start_time?: string | null
          total_hours?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          admin_edited_at?: string | null
          admin_edited_by?: string | null
          clock_in_at?: string | null
          clock_out_at?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          flat_rate_amount?: number | null
          hourly_rate_snapshot?: number | null
          id?: string
          is_flat_rate?: boolean
          project_id?: string | null
          shift_date?: string
          start_time?: string | null
          total_hours?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      store_sections: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_sections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      task_blockers: {
        Row: {
          blocked_at: string
          blocked_by_user_id: string
          created_at: string
          id: string
          needs_from_manager: string | null
          note: string | null
          reason: Database["public"]["Enums"]["blocker_reason"]
          resolution_note: string | null
          resolved_at: string | null
          resolved_by_user_id: string | null
          task_id: string
        }
        Insert: {
          blocked_at?: string
          blocked_by_user_id: string
          created_at?: string
          id?: string
          needs_from_manager?: string | null
          note?: string | null
          reason: Database["public"]["Enums"]["blocker_reason"]
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          task_id: string
        }
        Update: {
          blocked_at?: string
          blocked_by_user_id?: string
          created_at?: string
          id?: string
          needs_from_manager?: string | null
          note?: string | null
          reason?: Database["public"]["Enums"]["blocker_reason"]
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_blockers_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_candidates: {
        Row: {
          task_id: string
          user_id: string
        }
        Insert: {
          task_id: string
          user_id: string
        }
        Update: {
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_candidates_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          created_at: string
          id: string
          message: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_material_bundle_items: {
        Row: {
          bundle_id: string
          created_at: string
          id: string
          material_name: string
          provided_by: string | null
          qty: number | null
          sku: string | null
          store_section: string | null
          unit: string | null
          vendor_url: string | null
        }
        Insert: {
          bundle_id: string
          created_at?: string
          id?: string
          material_name: string
          provided_by?: string | null
          qty?: number | null
          sku?: string | null
          store_section?: string | null
          unit?: string | null
          vendor_url?: string | null
        }
        Update: {
          bundle_id?: string
          created_at?: string
          id?: string
          material_name?: string
          provided_by?: string | null
          qty?: number | null
          sku?: string | null
          store_section?: string | null
          unit?: string | null
          vendor_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_material_bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "task_material_bundles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_material_bundles: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          id: string
          keywords: string[] | null
          name: string
          org_id: string | null
          priority: number
          recipe_id: string | null
          trade: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          id?: string
          keywords?: string[] | null
          name: string
          org_id?: string | null
          priority?: number
          recipe_id?: string | null
          trade?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          id?: string
          keywords?: string[] | null
          name?: string
          org_id?: string | null
          priority?: number
          recipe_id?: string | null
          trade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_material_bundles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_material_bundles_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "task_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      task_materials: {
        Row: {
          confirmed_on_site: boolean
          created_at: string
          delivered: boolean
          id: string
          is_active: boolean
          item_type: string
          name: string
          provided_by: string
          purchased: boolean
          quantity: number | null
          sku: string | null
          store_section: string | null
          store_section_manual: boolean
          task_id: string
          tool_type_id: string | null
          unit: string | null
          unit_cost: number | null
          vendor_url: string | null
        }
        Insert: {
          confirmed_on_site?: boolean
          created_at?: string
          delivered?: boolean
          id?: string
          is_active?: boolean
          item_type?: string
          name: string
          provided_by?: string
          purchased?: boolean
          quantity?: number | null
          sku?: string | null
          store_section?: string | null
          store_section_manual?: boolean
          task_id: string
          tool_type_id?: string | null
          unit?: string | null
          unit_cost?: number | null
          vendor_url?: string | null
        }
        Update: {
          confirmed_on_site?: boolean
          created_at?: string
          delivered?: boolean
          id?: string
          is_active?: boolean
          item_type?: string
          name?: string
          provided_by?: string
          purchased?: boolean
          quantity?: number | null
          sku?: string | null
          store_section?: string | null
          store_section_manual?: boolean
          task_id?: string
          tool_type_id?: string | null
          unit?: string | null
          unit_cost?: number | null
          vendor_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_materials_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_materials_tool_type_id_fkey"
            columns: ["tool_type_id"]
            isOneToOne: false
            referencedRelation: "tool_types"
            referencedColumns: ["id"]
          },
        ]
      }
      task_photos: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          phase: string
          storage_path: string
          task_id: string
          uploaded_by: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          phase: string
          storage_path: string
          task_id: string
          uploaded_by: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          phase?: string
          storage_path?: string
          task_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_photos_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_recipe_step_materials: {
        Row: {
          created_at: string
          id: string
          item_type: string
          material_name: string
          notes: string | null
          provided_by: string | null
          qty: number | null
          qty_formula: string | null
          recipe_step_id: string
          sku: string | null
          store_section: string | null
          unit: string | null
          unit_cost: number | null
          vendor_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_type?: string
          material_name: string
          notes?: string | null
          provided_by?: string | null
          qty?: number | null
          qty_formula?: string | null
          recipe_step_id: string
          sku?: string | null
          store_section?: string | null
          unit?: string | null
          unit_cost?: number | null
          vendor_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_type?: string
          material_name?: string
          notes?: string | null
          provided_by?: string | null
          qty?: number | null
          qty_formula?: string | null
          recipe_step_id?: string
          sku?: string | null
          store_section?: string | null
          unit?: string | null
          unit_cost?: number | null
          vendor_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_recipe_step_materials_recipe_step_id_fkey"
            columns: ["recipe_step_id"]
            isOneToOne: false
            referencedRelation: "task_recipe_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      task_recipe_steps: {
        Row: {
          assignment_mode: string
          created_at: string
          created_by: string | null
          default_candidate_user_ids: string[]
          id: string
          is_optional: boolean
          notes: string | null
          recipe_id: string
          sort_order: number
          title: string
          trade: string | null
        }
        Insert: {
          assignment_mode?: string
          created_at?: string
          created_by?: string | null
          default_candidate_user_ids?: string[]
          id?: string
          is_optional?: boolean
          notes?: string | null
          recipe_id: string
          sort_order: number
          title: string
          trade?: string | null
        }
        Update: {
          assignment_mode?: string
          created_at?: string
          created_by?: string | null
          default_candidate_user_ids?: string[]
          id?: string
          is_optional?: boolean
          notes?: string | null
          recipe_id?: string
          sort_order?: number
          title?: string
          trade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_recipe_steps_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "task_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      task_recipes: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          estimated_cost: number | null
          id: string
          is_repeatable: boolean
          keywords: string[] | null
          last_actual_avg: number | null
          last_actual_count: number
          name: string
          org_id: string | null
          trade: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          estimated_cost?: number | null
          id?: string
          is_repeatable?: boolean
          keywords?: string[] | null
          last_actual_avg?: number | null
          last_actual_count?: number
          name: string
          org_id?: string | null
          trade?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          estimated_cost?: number | null
          id?: string
          is_repeatable?: boolean
          keywords?: string[] | null
          last_actual_avg?: number | null
          last_actual_count?: number
          name?: string
          org_id?: string | null
          trade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_recipes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      task_workers: {
        Row: {
          active: boolean
          joined_at: string
          left_at: string | null
          task_id: string
          user_id: string
        }
        Insert: {
          active?: boolean
          joined_at?: string
          left_at?: string | null
          task_id: string
          user_id: string
        }
        Update: {
          active?: boolean
          joined_at?: string
          left_at?: string | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_workers_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          actual_total_cost: number | null
          assigned_to_user_id: string | null
          assignment_mode: string
          bundles_applied: boolean
          claimed_at: string | null
          claimed_by_user_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          due_date: string | null
          expanded_recipe_id: string | null
          field_capture_id: string | null
          id: string
          is_blocked: boolean
          is_outside_vendor: boolean
          is_package: boolean
          is_recurring: boolean
          lead_user_id: string | null
          materials_on_site: Database["public"]["Enums"]["materials_status"]
          needs_manager_review: boolean
          notes: string | null
          parent_task_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          recipe_hint_id: string | null
          recurrence_anchor_date: string | null
          recurrence_frequency: string | null
          recurrence_source_task_id: string | null
          room_area: string | null
          sort_order: number | null
          source_recipe_id: string | null
          source_recipe_step_id: string | null
          source_scope_item_id: string | null
          stage: Database["public"]["Enums"]["task_stage"]
          started_at: string | null
          started_by_user_id: string | null
          task: string
          trade: string | null
          updated_at: string
        }
        Insert: {
          actual_total_cost?: number | null
          assigned_to_user_id?: string | null
          assignment_mode?: string
          bundles_applied?: boolean
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          due_date?: string | null
          expanded_recipe_id?: string | null
          field_capture_id?: string | null
          id?: string
          is_blocked?: boolean
          is_outside_vendor?: boolean
          is_package?: boolean
          is_recurring?: boolean
          lead_user_id?: string | null
          materials_on_site?: Database["public"]["Enums"]["materials_status"]
          needs_manager_review?: boolean
          notes?: string | null
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id: string
          recipe_hint_id?: string | null
          recurrence_anchor_date?: string | null
          recurrence_frequency?: string | null
          recurrence_source_task_id?: string | null
          room_area?: string | null
          sort_order?: number | null
          source_recipe_id?: string | null
          source_recipe_step_id?: string | null
          source_scope_item_id?: string | null
          stage?: Database["public"]["Enums"]["task_stage"]
          started_at?: string | null
          started_by_user_id?: string | null
          task: string
          trade?: string | null
          updated_at?: string
        }
        Update: {
          actual_total_cost?: number | null
          assigned_to_user_id?: string | null
          assignment_mode?: string
          bundles_applied?: boolean
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          due_date?: string | null
          expanded_recipe_id?: string | null
          field_capture_id?: string | null
          id?: string
          is_blocked?: boolean
          is_outside_vendor?: boolean
          is_package?: boolean
          is_recurring?: boolean
          lead_user_id?: string | null
          materials_on_site?: Database["public"]["Enums"]["materials_status"]
          needs_manager_review?: boolean
          notes?: string | null
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string
          recipe_hint_id?: string | null
          recurrence_anchor_date?: string | null
          recurrence_frequency?: string | null
          recurrence_source_task_id?: string | null
          room_area?: string | null
          sort_order?: number | null
          source_recipe_id?: string | null
          source_recipe_step_id?: string | null
          source_scope_item_id?: string | null
          stage?: Database["public"]["Enums"]["task_stage"]
          started_at?: string | null
          started_by_user_id?: string | null
          task?: string
          trade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_claimed_by_user_id_fkey"
            columns: ["claimed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_expanded_recipe_id_fkey"
            columns: ["expanded_recipe_id"]
            isOneToOne: false
            referencedRelation: "task_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_field_capture_id_fkey"
            columns: ["field_capture_id"]
            isOneToOne: false
            referencedRelation: "field_captures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_recipe_hint_id_fkey"
            columns: ["recipe_hint_id"]
            isOneToOne: false
            referencedRelation: "task_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_recurrence_source_task_id_fkey"
            columns: ["recurrence_source_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_recipe_id_fkey"
            columns: ["source_recipe_id"]
            isOneToOne: false
            referencedRelation: "task_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_recipe_step_id_fkey"
            columns: ["source_recipe_step_id"]
            isOneToOne: false
            referencedRelation: "task_recipe_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_scope_item_id_fkey"
            columns: ["source_scope_item_id"]
            isOneToOne: false
            referencedRelation: "scope_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_started_by_user_id_fkey"
            columns: ["started_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          phone: string | null
          project_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          project_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_stock: {
        Row: {
          id: string
          location_type: string
          project_id: string | null
          qty: number
          tool_type_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          location_type: string
          project_id?: string | null
          qty?: number
          tool_type_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          location_type?: string
          project_id?: string | null
          qty?: number
          tool_type_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tool_stock_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_stock_tool_type_id_fkey"
            columns: ["tool_type_id"]
            isOneToOne: false
            referencedRelation: "tool_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_stock_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_types: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sku: string | null
          vendor_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sku?: string | null
          vendor_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sku?: string | null
          vendor_url?: string | null
        }
        Relationships: []
      }
      vendors: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          city: string | null
          company_id: string
          country: string | null
          created_at: string
          created_by: string
          email: string | null
          id: string
          name: string
          phone: string | null
          postal_code: string | null
          quickbooks_display_name: string | null
          quickbooks_last_error: string | null
          quickbooks_last_synced_at: string | null
          quickbooks_sync_status: string
          quickbooks_vendor_id: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          company_id: string
          country?: string | null
          created_at?: string
          created_by: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          postal_code?: string | null
          quickbooks_display_name?: string | null
          quickbooks_last_error?: string | null
          quickbooks_last_synced_at?: string | null
          quickbooks_sync_status?: string
          quickbooks_vendor_id?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          company_id?: string
          country?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          postal_code?: string | null
          quickbooks_display_name?: string | null
          quickbooks_last_error?: string | null
          quickbooks_last_synced_at?: string | null
          quickbooks_sync_status?: string
          quickbooks_vendor_id?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_availability: {
        Row: {
          available_date: string
          created_at: string
          end_time: string
          id: string
          notes: string | null
          start_time: string
          updated_at: string
          user_id: string
        }
        Insert: {
          available_date: string
          created_at?: string
          end_time: string
          id?: string
          notes?: string | null
          start_time: string
          updated_at?: string
          user_id: string
        }
        Update: {
          available_date?: string
          created_at?: string
          end_time?: string
          id?: string
          notes?: string | null
          start_time?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_availability_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_payable_batch_shifts: {
        Row: {
          created_at: string
          id: string
          payable_batch_id: string
          shift_id: string
          voided_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          payable_batch_id: string
          shift_id: string
          voided_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          payable_batch_id?: string
          shift_id?: string
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_payable_batch_shifts_payable_batch_id_fkey"
            columns: ["payable_batch_id"]
            isOneToOne: false
            referencedRelation: "worker_payable_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_payable_batch_shifts_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_payable_batches: {
        Row: {
          accounting_source: string | null
          company_id: string | null
          created_at: string
          created_by: string
          id: string
          marked_paid_by: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          project_id: string | null
          qb_bill_doc_number: string | null
          qb_bill_id: string | null
          qb_export_error: string | null
          qb_exported_at: string | null
          qb_matched_at: string | null
          qb_matched_by: string | null
          settlement_method: string | null
          split_from_batch_id: string | null
          status: string
          total_amount: number
          updated_at: string
          voided_at: string | null
          worker_user_id: string
        }
        Insert: {
          accounting_source?: string | null
          company_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          marked_paid_by?: string | null
          paid_at?: string | null
          period_end: string
          period_start: string
          project_id?: string | null
          qb_bill_doc_number?: string | null
          qb_bill_id?: string | null
          qb_export_error?: string | null
          qb_exported_at?: string | null
          qb_matched_at?: string | null
          qb_matched_by?: string | null
          settlement_method?: string | null
          split_from_batch_id?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          voided_at?: string | null
          worker_user_id: string
        }
        Update: {
          accounting_source?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          marked_paid_by?: string | null
          paid_at?: string | null
          period_end?: string
          period_start?: string
          project_id?: string | null
          qb_bill_doc_number?: string | null
          qb_bill_id?: string | null
          qb_export_error?: string | null
          qb_exported_at?: string | null
          qb_matched_at?: string | null
          qb_matched_by?: string | null
          settlement_method?: string | null
          split_from_batch_id?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          voided_at?: string | null
          worker_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_payable_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_payable_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_payable_batches_marked_paid_by_fkey"
            columns: ["marked_paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_payable_batches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_payable_batches_split_from_batch_id_fkey"
            columns: ["split_from_batch_id"]
            isOneToOne: false
            referencedRelation: "worker_payable_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_payable_batches_worker_user_id_fkey"
            columns: ["worker_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_payment_shifts: {
        Row: {
          amount_paid: number
          created_at: string
          hourly_rate_used: number
          hours_paid: number
          id: string
          shift_id: string
          worker_payment_id: string
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          hourly_rate_used?: number
          hours_paid?: number
          id?: string
          shift_id: string
          worker_payment_id: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          hourly_rate_used?: number
          hours_paid?: number
          id?: string
          shift_id?: string
          worker_payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_payment_shifts_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_payment_shifts_worker_payment_id_fkey"
            columns: ["worker_payment_id"]
            isOneToOne: false
            referencedRelation: "worker_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_payments: {
        Row: {
          amount: number
          company_id: string | null
          created_at: string
          created_by: string
          external_reference: string | null
          id: string
          marked_paid_by: string | null
          memo: string | null
          paid_at: string | null
          paid_date: string
          pay_period_end: string | null
          pay_period_start: string | null
          payment_source: Database["public"]["Enums"]["worker_payment_source"]
          payout_run_id: string | null
          project_id: string | null
          qb_txn_amount: number | null
          qb_txn_type: string | null
          status: Database["public"]["Enums"]["worker_payment_status"]
          stripe_balance_transaction_id: string | null
          stripe_payout_id: string | null
          stripe_transfer_id: string | null
          worker_user_id: string
        }
        Insert: {
          amount: number
          company_id?: string | null
          created_at?: string
          created_by: string
          external_reference?: string | null
          id?: string
          marked_paid_by?: string | null
          memo?: string | null
          paid_at?: string | null
          paid_date: string
          pay_period_end?: string | null
          pay_period_start?: string | null
          payment_source: Database["public"]["Enums"]["worker_payment_source"]
          payout_run_id?: string | null
          project_id?: string | null
          qb_txn_amount?: number | null
          qb_txn_type?: string | null
          status?: Database["public"]["Enums"]["worker_payment_status"]
          stripe_balance_transaction_id?: string | null
          stripe_payout_id?: string | null
          stripe_transfer_id?: string | null
          worker_user_id: string
        }
        Update: {
          amount?: number
          company_id?: string | null
          created_at?: string
          created_by?: string
          external_reference?: string | null
          id?: string
          marked_paid_by?: string | null
          memo?: string | null
          paid_at?: string | null
          paid_date?: string
          pay_period_end?: string | null
          pay_period_start?: string | null
          payment_source?: Database["public"]["Enums"]["worker_payment_source"]
          payout_run_id?: string | null
          project_id?: string | null
          qb_txn_amount?: number | null
          qb_txn_type?: string | null
          status?: Database["public"]["Enums"]["worker_payment_status"]
          stripe_balance_transaction_id?: string | null
          stripe_payout_id?: string | null
          stripe_transfer_id?: string | null
          worker_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_payments_payout_run_id_fkey"
            columns: ["payout_run_id"]
            isOneToOne: false
            referencedRelation: "payout_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_payments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_payments_worker_user_id_fkey"
            columns: ["worker_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_payout_profiles: {
        Row: {
          charges_enabled: boolean
          created_at: string
          default_payment_source: Database["public"]["Enums"]["worker_payment_source"]
          details_submitted: boolean
          onboarding_status: Database["public"]["Enums"]["payout_onboarding_status"]
          payouts_enabled: boolean
          stripe_connected_account_id: string | null
          updated_at: string
          user_id: string
          venmo_handle: string | null
          venmo_note_template: string | null
        }
        Insert: {
          charges_enabled?: boolean
          created_at?: string
          default_payment_source?: Database["public"]["Enums"]["worker_payment_source"]
          details_submitted?: boolean
          onboarding_status?: Database["public"]["Enums"]["payout_onboarding_status"]
          payouts_enabled?: boolean
          stripe_connected_account_id?: string | null
          updated_at?: string
          user_id: string
          venmo_handle?: string | null
          venmo_note_template?: string | null
        }
        Update: {
          charges_enabled?: boolean
          created_at?: string
          default_payment_source?: Database["public"]["Enums"]["worker_payment_source"]
          details_submitted?: boolean
          onboarding_status?: Database["public"]["Enums"]["payout_onboarding_status"]
          payouts_enabled?: boolean
          stripe_connected_account_id?: string | null
          updated_at?: string
          user_id?: string
          venmo_handle?: string | null
          venmo_note_template?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_payout_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_tax_profiles: {
        Row: {
          created_at: string
          tax_classification: Database["public"]["Enums"]["worker_tax_classification"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          tax_classification?: Database["public"]["Enums"]["worker_tax_classification"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          tax_classification?: Database["public"]["Enums"]["worker_tax_classification"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_tax_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_force_clock_out: {
        Args: { p_shift_id: string }
        Returns: {
          admin_edited_at: string | null
          admin_edited_by: string | null
          clock_in_at: string | null
          clock_out_at: string | null
          created_at: string
          created_by: string | null
          end_time: string | null
          flat_rate_amount: number | null
          hourly_rate_snapshot: number | null
          id: string
          is_flat_rate: boolean
          project_id: string | null
          shift_date: string
          start_time: string | null
          total_hours: number | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "shifts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_get_profile_pay: {
        Args: never
        Returns: {
          dd_on_file: boolean
          hourly_rate: number
          id: string
          skip_qb_export: boolean
          tax_info_filed: boolean
        }[]
      }
      admin_list_stranded_users: {
        Args: never
        Returns: {
          current_org_id: string
          current_org_member_count: number
          current_org_name: string
          current_org_project_count: number
          email: string
          full_name: string
          user_id: string
        }[]
      }
      admin_mark_visible_shifts_paid: {
        Args: {
          p_confirmation_note?: string
          p_memo?: string
          p_payment_source?: Database["public"]["Enums"]["worker_payment_source"]
          p_period_end: string
          p_period_start: string
          p_shift_ids: string[]
          p_worker_user_id: string
        }
        Returns: Json
      }
      admin_move_user_to_my_org: {
        Args: {
          p_role?: Database["public"]["Enums"]["org_role"]
          p_target_user_id: string
        }
        Returns: Json
      }
      apply_assignment_rules: {
        Args: { p_task_id: string }
        Returns: undefined
      }
      can_manage_projects: { Args: { _user_id: string }; Returns: boolean }
      capture_recipe_from_task: {
        Args: { p_parent_task_id: string; p_recipe_id: string }
        Returns: Json
      }
      clock_in: {
        Args: { p_project_id?: string }
        Returns: {
          admin_edited_at: string | null
          admin_edited_by: string | null
          clock_in_at: string | null
          clock_out_at: string | null
          created_at: string
          created_by: string | null
          end_time: string | null
          flat_rate_amount: number | null
          hourly_rate_snapshot: number | null
          id: string
          is_flat_rate: boolean
          project_id: string | null
          shift_date: string
          start_time: string | null
          total_hours: number | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "shifts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      clock_out: {
        Args: never
        Returns: {
          admin_edited_at: string | null
          admin_edited_by: string | null
          clock_in_at: string | null
          clock_out_at: string | null
          created_at: string
          created_by: string | null
          end_time: string | null
          flat_rate_amount: number | null
          hourly_rate_snapshot: number | null
          id: string
          is_flat_rate: boolean
          project_id: string | null
          shift_date: string
          start_time: string | null
          total_hours: number | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "shifts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      clone_seed_libraries_to_org: {
        Args: { p_org_id: string }
        Returns: undefined
      }
      complete_recurring_task: { Args: { p_task_id: string }; Returns: string }
      convert_scope_to_project: { Args: { p_scope_id: string }; Returns: Json }
      expand_recipe: {
        Args: {
          p_parent_task_id: string
          p_recipe_id: string
          p_user_id: string
        }
        Returns: number
      }
      get_my_profile_pay: {
        Args: never
        Returns: {
          dd_on_file: boolean
          hourly_rate: number
          skip_qb_export: boolean
          tax_info_filed: boolean
        }[]
      }
      get_org_role: {
        Args: { _org_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["org_role"]
      }
      get_project_role: {
        Args: { _project_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["project_member_role"]
      }
      get_scope_role: {
        Args: { _scope_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["scope_member_role"]
      }
      get_user_org_id: { Args: { _user_id: string }; Returns: string }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_org_admin: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_project_member: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      is_same_org: {
        Args: { _user_id_a: string; _user_id_b: string }
        Returns: boolean
      }
      is_scope_member: {
        Args: { _scope_id: string; _user_id: string }
        Returns: boolean
      }
      mark_batch_qb_matched: {
        Args: { p_batch_id: string; p_matched: boolean }
        Returns: undefined
      }
      merge_projects: {
        Args: { p_project_a: string; p_project_b: string }
        Returns: string
      }
      push_material_library_to_all: {
        Args: { p_material_id: string }
        Returns: Json
      }
      push_recipe_step_to_tasks: { Args: { p_step_id: string }; Returns: Json }
      push_recipe_to_tasks: { Args: { p_recipe_id: string }; Returns: Json }
      revoke_org_invite: { Args: { p_invite_id: string }; Returns: undefined }
      save_linked_historical_payments: {
        Args: {
          p_allocations: Json
          p_caller_id: string
          p_company_id: string
          p_external_reference: string
          p_qb_txn_amount: number
          p_qb_txn_type: string
        }
        Returns: Json
      }
      save_local_historical_payment: {
        Args: {
          p_amount: number
          p_caller_id: string
          p_company_id?: string
          p_memo?: string
          p_paid_date: string
          p_pay_period_end?: string
          p_pay_period_start?: string
          p_project_id?: string
          p_worker_user_id: string
        }
        Returns: Json
      }
      split_payable_batch: {
        Args: { p_batch_id: string; p_first_amount: number }
        Returns: {
          new_batch_id: string
          original_batch_id: string
        }[]
      }
      upsert_shift_with_allocations: {
        Args: {
          p_allocations?: Json
          p_end_time?: string
          p_flat_rate_amount?: number
          p_is_admin_edit?: boolean
          p_is_flat_rate?: boolean
          p_project_id?: string
          p_shift_date?: string
          p_shift_id?: string
          p_start_time?: string
          p_total_hours?: number
          p_user_id?: string
        }
        Returns: Json
      }
      user_can_see_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      blocker_reason:
        | "missing_materials"
        | "access_issue"
        | "waiting_on_approval"
        | "hidden_damage"
        | "tool_equipment"
        | "waiting_on_trade"
        | "other"
      materials_status: "Yes" | "Partial" | "No"
      org_role: "owner" | "admin" | "member"
      payout_onboarding_status:
        | "not_started"
        | "in_progress"
        | "completed"
        | "restricted"
      payout_run_status:
        | "draft"
        | "submitted"
        | "completed"
        | "canceled"
        | "failed"
        | "partially_failed"
      pricing_status: "Priced" | "Needs Pricing"
      project_member_role: "contractor" | "manager" | "read_only"
      project_status: "active" | "paused" | "complete"
      project_type: "construction" | "rental" | "general"
      reimbursement_status:
        | "submitted"
        | "needs_info"
        | "not_approved"
        | "approved"
        | "exported"
        | "paid"
        | "voided"
      scope_member_role: "viewer" | "editor" | "manager"
      scope_status: "Draft" | "Converted" | "Archived" | "active" | "archived"
      task_priority:
        | "1 – Now"
        | "2 – This Week"
        | "3 – Soon"
        | "4 – When Time"
        | "5 – Later"
      task_stage: "Ready" | "In Progress" | "Not Ready" | "Hold" | "Done"
      unit_type: "each" | "sqft" | "lf" | "piece"
      worker_payment_source:
        | "stripe_connect"
        | "manual_quickbooks"
        | "venmo_manual"
        | "quickbooks_linked"
      worker_payment_status:
        | "pending"
        | "processing"
        | "paid"
        | "failed"
        | "voided"
      worker_tax_classification: "contractor_1099" | "employee_w2"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      blocker_reason: [
        "missing_materials",
        "access_issue",
        "waiting_on_approval",
        "hidden_damage",
        "tool_equipment",
        "waiting_on_trade",
        "other",
      ],
      materials_status: ["Yes", "Partial", "No"],
      org_role: ["owner", "admin", "member"],
      payout_onboarding_status: [
        "not_started",
        "in_progress",
        "completed",
        "restricted",
      ],
      payout_run_status: [
        "draft",
        "submitted",
        "completed",
        "canceled",
        "failed",
        "partially_failed",
      ],
      pricing_status: ["Priced", "Needs Pricing"],
      project_member_role: ["contractor", "manager", "read_only"],
      project_status: ["active", "paused", "complete"],
      project_type: ["construction", "rental", "general"],
      reimbursement_status: [
        "submitted",
        "needs_info",
        "not_approved",
        "approved",
        "exported",
        "paid",
        "voided",
      ],
      scope_member_role: ["viewer", "editor", "manager"],
      scope_status: ["Draft", "Converted", "Archived", "active", "archived"],
      task_priority: [
        "1 – Now",
        "2 – This Week",
        "3 – Soon",
        "4 – When Time",
        "5 – Later",
      ],
      task_stage: ["Ready", "In Progress", "Not Ready", "Hold", "Done"],
      unit_type: ["each", "sqft", "lf", "piece"],
      worker_payment_source: [
        "stripe_connect",
        "manual_quickbooks",
        "venmo_manual",
        "quickbooks_linked",
      ],
      worker_payment_status: [
        "pending",
        "processing",
        "paid",
        "failed",
        "voided",
      ],
      worker_tax_classification: ["contractor_1099", "employee_w2"],
    },
  },
} as const
