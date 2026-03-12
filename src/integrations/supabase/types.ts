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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
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
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      cost_items: {
        Row: {
          active: boolean
          created_at: string
          default_total_cost: number
          id: string
          name: string
          normalized_name: string | null
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
          piece_length_ft?: number | null
          unit_type?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
        }
        Relationships: []
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
          sku?: string | null
          store_section?: string | null
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string
          vendor_url?: string | null
        }
        Relationships: []
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
          full_name: string | null
          hourly_rate: number | null
          id: string
          is_admin: boolean
        }
        Insert: {
          can_manage_projects?: boolean
          created_at?: string
          full_name?: string | null
          hourly_rate?: number | null
          id: string
          is_admin?: boolean
        }
        Update: {
          can_manage_projects?: boolean
          created_at?: string
          full_name?: string | null
          hourly_rate?: number | null
          id?: string
          is_admin?: boolean
        }
        Relationships: []
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
          created_at: string
          has_missing_estimates: boolean
          id: string
          name: string
          project_type: Database["public"]["Enums"]["project_type"]
          scope_id: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          has_missing_estimates?: boolean
          id?: string
          name: string
          project_type?: Database["public"]["Enums"]["project_type"]
          scope_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          has_missing_estimates?: boolean
          id?: string
          name?: string
          project_type?: Database["public"]["Enums"]["project_type"]
          scope_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "scopes"
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
          updated_at?: string
        }
        Relationships: []
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
          created_at: string
          created_by: string | null
          end_time: string | null
          hourly_rate_snapshot: number | null
          id: string
          project_id: string
          shift_date: string
          start_time: string | null
          total_hours: number
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          admin_edited_at?: string | null
          admin_edited_by?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          hourly_rate_snapshot?: number | null
          id?: string
          project_id: string
          shift_date: string
          start_time?: string | null
          total_hours: number
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          admin_edited_at?: string | null
          admin_edited_by?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          hourly_rate_snapshot?: number | null
          id?: string
          project_id?: string
          shift_date?: string
          start_time?: string | null
          total_hours?: number
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
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
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
          priority?: number
          recipe_id?: string | null
          trade?: string | null
          updated_at?: string
        }
        Relationships: [
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
          trade?: string | null
          updated_at?: string
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_assignment_rules: {
        Args: { p_task_id: string }
        Returns: undefined
      }
      can_manage_projects: { Args: { _user_id: string }; Returns: boolean }
      capture_recipe_from_task: {
        Args: { p_parent_task_id: string; p_recipe_id: string }
        Returns: Json
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
      get_project_role: {
        Args: { _project_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["project_member_role"]
      }
      get_scope_role: {
        Args: { _scope_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["scope_member_role"]
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_project_member: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      is_scope_member: {
        Args: { _scope_id: string; _user_id: string }
        Returns: boolean
      }
      push_material_library_to_all: {
        Args: { p_material_id: string }
        Returns: Json
      }
      push_recipe_to_tasks: { Args: { p_recipe_id: string }; Returns: Json }
      upsert_shift_with_allocations: {
        Args: {
          p_allocations?: Json
          p_end_time?: string
          p_is_admin_edit?: boolean
          p_project_id?: string
          p_shift_date?: string
          p_shift_id?: string
          p_start_time?: string
          p_total_hours?: number
          p_user_id?: string
        }
        Returns: Json
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
      pricing_status: "Priced" | "Needs Pricing"
      project_member_role: "contractor" | "manager" | "read_only"
      project_status: "active" | "paused" | "complete"
      project_type: "construction" | "rental" | "general"
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
      pricing_status: ["Priced", "Needs Pricing"],
      project_member_role: ["contractor", "manager", "read_only"],
      project_status: ["active", "paused", "complete"],
      project_type: ["construction", "rental", "general"],
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
    },
  },
} as const
