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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          attachments: Json
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          ui_action: Json | null
        }
        Insert: {
          attachments?: Json
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          ui_action?: Json | null
        }
        Update: {
          attachments?: Json
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          ui_action?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_runs: {
        Row: {
          completed_at: string | null
          conversation_id: string | null
          created_at: string
          error_code: string | null
          id: string
          input_metadata: Json
          model: string
          output_metadata: Json
          run_type: string
          status: Database["public"]["Enums"]["ai_run_status"]
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          input_metadata?: Json
          model: string
          output_metadata?: Json
          run_type: string
          status?: Database["public"]["Enums"]["ai_run_status"]
          user_id: string
        }
        Update: {
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          input_metadata?: Json
          model?: string
          output_metadata?: Json
          run_type?: string
          status?: Database["public"]["Enums"]["ai_run_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      body_metrics: {
        Row: {
          arm_cm: number | null
          body_fat_percent: number | null
          chest_cm: number | null
          created_at: string
          id: string
          measured_at: string
          notes: string | null
          thigh_cm: number | null
          updated_at: string
          user_id: string
          waist_cm: number | null
          weight_kg: number | null
        }
        Insert: {
          arm_cm?: number | null
          body_fat_percent?: number | null
          chest_cm?: number | null
          created_at?: string
          id?: string
          measured_at?: string
          notes?: string | null
          thigh_cm?: number | null
          updated_at?: string
          user_id: string
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Update: {
          arm_cm?: number | null
          body_fat_percent?: number | null
          chest_cm?: number | null
          created_at?: string
          id?: string
          measured_at?: string
          notes?: string | null
          thigh_cm?: number | null
          updated_at?: string
          user_id?: string
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      custom_exercises: {
        Row: {
          body_part: string | null
          category: string | null
          created_at: string
          description: string | null
          equipment: string | null
          id: string
          instruction_steps: string[]
          instructions: string | null
          media_path: string | null
          muscle_group: string | null
          name: string
          secondary_muscles: string[]
          source_exercise_key: string | null
          source_import_id: string | null
          target: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body_part?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          equipment?: string | null
          id?: string
          instruction_steps?: string[]
          instructions?: string | null
          media_path?: string | null
          muscle_group?: string | null
          name: string
          secondary_muscles?: string[]
          source_exercise_key?: string | null
          source_import_id?: string | null
          target?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body_part?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          equipment?: string | null
          id?: string
          instruction_steps?: string[]
          instructions?: string | null
          media_path?: string | null
          muscle_group?: string | null
          name?: string
          secondary_muscles?: string[]
          source_exercise_key?: string | null
          source_import_id?: string | null
          target?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_exercises_source_import_id_user_id_fkey"
            columns: ["source_import_id", "user_id"]
            isOneToOne: false
            referencedRelation: "routine_imports"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      exercise_catalog: {
        Row: {
          attribution: Json
          body_part: string | null
          category: string | null
          created_at: string
          equipment: string | null
          gif_source: string | null
          id: string
          image_source: string | null
          instruction_steps: string[]
          instructions: string | null
          media_id: string | null
          muscle_group: string | null
          name: string
          secondary_muscles: string[]
          source_version: string
          target: string | null
          updated_at: string
        }
        Insert: {
          attribution?: Json
          body_part?: string | null
          category?: string | null
          created_at?: string
          equipment?: string | null
          gif_source?: string | null
          id: string
          image_source?: string | null
          instruction_steps?: string[]
          instructions?: string | null
          media_id?: string | null
          muscle_group?: string | null
          name: string
          secondary_muscles?: string[]
          source_version: string
          target?: string | null
          updated_at?: string
        }
        Update: {
          attribution?: Json
          body_part?: string | null
          category?: string | null
          created_at?: string
          equipment?: string | null
          gif_source?: string | null
          id?: string
          image_source?: string | null
          instruction_steps?: string[]
          instructions?: string | null
          media_id?: string | null
          muscle_group?: string | null
          name?: string
          secondary_muscles?: string[]
          source_version?: string
          target?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fitness_goals: {
        Row: {
          created_at: string
          goal_type: Database["public"]["Enums"]["goal_type"]
          id: string
          is_active: boolean
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          goal_type: Database["public"]["Enums"]["goal_type"]
          id?: string
          is_active?: boolean
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          goal_type?: Database["public"]["Enums"]["goal_type"]
          id?: string
          is_active?: boolean
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      food_log_items: {
        Row: {
          calories: number
          carbohydrate_grams: number
          confidence: number | null
          created_at: string
          estimate_note: string | null
          fat_grams: number
          fiber_grams: number | null
          food_log_id: string
          grams: number | null
          id: string
          name: string
          protein_grams: number
          quantity: number | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          calories: number
          carbohydrate_grams?: number
          confidence?: number | null
          created_at?: string
          estimate_note?: string | null
          fat_grams?: number
          fiber_grams?: number | null
          food_log_id: string
          grams?: number | null
          id?: string
          name: string
          protein_grams?: number
          quantity?: number | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          calories?: number
          carbohydrate_grams?: number
          confidence?: number | null
          created_at?: string
          estimate_note?: string | null
          fat_grams?: number
          fiber_grams?: number | null
          food_log_id?: string
          grams?: number | null
          id?: string
          name?: string
          protein_grams?: number
          quantity?: number | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_log_items_food_log_id_fkey"
            columns: ["food_log_id"]
            isOneToOne: false
            referencedRelation: "food_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      food_logs: {
        Row: {
          created_at: string
          id: string
          logged_date: string
          meal_type: Database["public"]["Enums"]["meal_type"]
          name: string | null
          photo_path: string | null
          source: Database["public"]["Enums"]["food_source"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          logged_date?: string
          meal_type: Database["public"]["Enums"]["meal_type"]
          name?: string | null
          photo_path?: string | null
          source?: Database["public"]["Enums"]["food_source"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          logged_date?: string
          meal_type?: Database["public"]["Enums"]["meal_type"]
          name?: string | null
          photo_path?: string | null
          source?: Database["public"]["Enums"]["food_source"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nutrition_targets: {
        Row: {
          calories: number
          carbohydrate_grams: number
          created_at: string
          effective_from: string
          fat_grams: number
          fiber_grams: number | null
          id: string
          protein_grams: number
          updated_at: string
          user_id: string
        }
        Insert: {
          calories: number
          carbohydrate_grams: number
          created_at?: string
          effective_from?: string
          fat_grams: number
          fiber_grams?: number | null
          id?: string
          protein_grams: number
          updated_at?: string
          user_id: string
        }
        Update: {
          calories?: number
          carbohydrate_grams?: number
          created_at?: string
          effective_from?: string
          fat_grams?: number
          fiber_grams?: number | null
          id?: string
          protein_grams?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          available_equipment: string[]
          biological_sex: Database["public"]["Enums"]["biological_sex"] | null
          birth_date: string | null
          created_at: string
          daily_activity_level: Database["public"]["Enums"]["daily_activity_level"]
          delete_food_photo_after_analysis: boolean
          diet_preference: string | null
          display_name: string | null
          exercises_to_avoid: string[]
          goal_body_fat_max: number | null
          goal_body_fat_min: number | null
          height_cm: number | null
          id: string
          onboarding_completed_at: string | null
          preferred_session_minutes: number | null
          preferred_units: string
          target_weight_kg: number | null
          training_days_per_week: number | null
          training_experience:
            | Database["public"]["Enums"]["training_experience"]
            | null
          updated_at: string
        }
        Insert: {
          available_equipment?: string[]
          biological_sex?: Database["public"]["Enums"]["biological_sex"] | null
          birth_date?: string | null
          created_at?: string
          daily_activity_level?: Database["public"]["Enums"]["daily_activity_level"]
          delete_food_photo_after_analysis?: boolean
          diet_preference?: string | null
          display_name?: string | null
          exercises_to_avoid?: string[]
          goal_body_fat_max?: number | null
          goal_body_fat_min?: number | null
          height_cm?: number | null
          id: string
          onboarding_completed_at?: string | null
          preferred_session_minutes?: number | null
          preferred_units?: string
          target_weight_kg?: number | null
          training_days_per_week?: number | null
          training_experience?:
            | Database["public"]["Enums"]["training_experience"]
            | null
          updated_at?: string
        }
        Update: {
          available_equipment?: string[]
          biological_sex?: Database["public"]["Enums"]["biological_sex"] | null
          birth_date?: string | null
          created_at?: string
          daily_activity_level?: Database["public"]["Enums"]["daily_activity_level"]
          delete_food_photo_after_analysis?: boolean
          diet_preference?: string | null
          display_name?: string | null
          exercises_to_avoid?: string[]
          goal_body_fat_max?: number | null
          goal_body_fat_min?: number | null
          height_cm?: number | null
          id?: string
          onboarding_completed_at?: string | null
          preferred_session_minutes?: number | null
          preferred_units?: string
          target_weight_kg?: number | null
          training_days_per_week?: number | null
          training_experience?:
            | Database["public"]["Enums"]["training_experience"]
            | null
          updated_at?: string
        }
        Relationships: []
      }
      progress_photos: {
        Row: {
          captured_at: string
          created_at: string
          id: string
          notes: string | null
          storage_path: string
          user_id: string
        }
        Insert: {
          captured_at?: string
          created_at?: string
          id?: string
          notes?: string | null
          storage_path: string
          user_id: string
        }
        Update: {
          captured_at?: string
          created_at?: string
          id?: string
          notes?: string | null
          storage_path?: string
          user_id?: string
        }
        Relationships: []
      }
      routine_days: {
        Row: {
          created_at: string
          day_index: number
          id: string
          is_rest_day: boolean
          name: string
          notes: string | null
          routine_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_index: number
          id?: string
          is_rest_day?: boolean
          name: string
          notes?: string | null
          routine_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_index?: number
          id?: string
          is_rest_day?: boolean
          name?: string
          notes?: string | null
          routine_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_days_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "workout_routines"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_exercises: {
        Row: {
          created_at: string
          custom_exercise_id: string | null
          exercise_id: string | null
          exercise_index: number
          id: string
          notes: string | null
          rep_max: number | null
          rep_min: number | null
          rest_seconds: number
          routine_day_id: string
          target_rir: number | null
          target_rpe: number | null
          target_sets: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_exercise_id?: string | null
          exercise_id?: string | null
          exercise_index: number
          id?: string
          notes?: string | null
          rep_max?: number | null
          rep_min?: number | null
          rest_seconds?: number
          routine_day_id: string
          target_rir?: number | null
          target_rpe?: number | null
          target_sets?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_exercise_id?: string | null
          exercise_id?: string | null
          exercise_index?: number
          id?: string
          notes?: string | null
          rep_max?: number | null
          rep_min?: number | null
          rest_seconds?: number
          routine_day_id?: string
          target_rir?: number | null
          target_rpe?: number | null
          target_sets?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_exercises_custom_exercise_id_fkey"
            columns: ["custom_exercise_id"]
            isOneToOne: false
            referencedRelation: "custom_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_exercises_routine_day_id_fkey"
            columns: ["routine_day_id"]
            isOneToOne: false
            referencedRelation: "routine_days"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_import_exercises: {
        Row: {
          candidates: Json
          created_at: string
          custom_exercise: Json
          exercise_key: string
          import_id: string
          page_number: number | null
          source_bbox: Json | null
          source_details: string | null
          source_title: string
          staged_image_path: string | null
          suggested_resolution: Json
        }
        Insert: {
          candidates?: Json
          created_at?: string
          custom_exercise: Json
          exercise_key: string
          import_id: string
          page_number?: number | null
          source_bbox?: Json | null
          source_details?: string | null
          source_title: string
          staged_image_path?: string | null
          suggested_resolution: Json
        }
        Update: {
          candidates?: Json
          created_at?: string
          custom_exercise?: Json
          exercise_key?: string
          import_id?: string
          page_number?: number | null
          source_bbox?: Json | null
          source_details?: string | null
          source_title?: string
          staged_image_path?: string | null
          suggested_resolution?: Json
        }
        Relationships: [
          {
            foreignKeyName: "routine_import_exercises_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "routine_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_imports: {
        Row: {
          ai_run_id: string | null
          cleanup_completed_at: string | null
          confirmed_at: string | null
          created_at: string
          expires_at: string
          extraction: Json
          id: string
          routine_id: string | null
          source_file_name: string
          source_mime_type: string
          source_storage_path: string
          status: string
          updated_at: string
          user_id: string
          warnings: Json
        }
        Insert: {
          ai_run_id?: string | null
          cleanup_completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          expires_at: string
          extraction: Json
          id: string
          routine_id?: string | null
          source_file_name: string
          source_mime_type: string
          source_storage_path: string
          status?: string
          updated_at?: string
          user_id: string
          warnings?: Json
        }
        Update: {
          ai_run_id?: string | null
          cleanup_completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          expires_at?: string
          extraction?: Json
          id?: string
          routine_id?: string | null
          source_file_name?: string
          source_mime_type?: string
          source_storage_path?: string
          status?: string
          updated_at?: string
          user_id?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "routine_imports_ai_run_id_fkey"
            columns: ["ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_imports_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: true
            referencedRelation: "workout_routines"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_foods: {
        Row: {
          calories: number
          carbohydrate_grams: number
          created_at: string
          fat_grams: number
          fiber_grams: number | null
          id: string
          last_logged_at: string | null
          name: string
          protein_grams: number
          serving_grams: number | null
          serving_quantity: number | null
          serving_unit: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          calories: number
          carbohydrate_grams?: number
          created_at?: string
          fat_grams?: number
          fiber_grams?: number | null
          id?: string
          last_logged_at?: string | null
          name: string
          protein_grams?: number
          serving_grams?: number | null
          serving_quantity?: number | null
          serving_unit?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          calories?: number
          carbohydrate_grams?: number
          created_at?: string
          fat_grams?: number
          fiber_grams?: number | null
          id?: string
          last_logged_at?: string | null
          name?: string
          protein_grams?: number
          serving_grams?: number | null
          serving_quantity?: number | null
          serving_unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workout_routines: {
        Row: {
          created_at: string
          current_cycle_index: number
          description: string | null
          id: string
          name: string
          source: string
          status: Database["public"]["Enums"]["routine_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_cycle_index?: number
          description?: string | null
          id?: string
          name: string
          source?: string
          status?: Database["public"]["Enums"]["routine_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_cycle_index?: number
          description?: string | null
          id?: string
          name?: string
          source?: string
          status?: Database["public"]["Enums"]["routine_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workout_session_exercises: {
        Row: {
          created_at: string
          custom_exercise_id: string | null
          exercise_id: string | null
          exercise_index: number
          id: string
          notes: string | null
          updated_at: string
          workout_session_id: string
        }
        Insert: {
          created_at?: string
          custom_exercise_id?: string | null
          exercise_id?: string | null
          exercise_index: number
          id?: string
          notes?: string | null
          updated_at?: string
          workout_session_id: string
        }
        Update: {
          created_at?: string
          custom_exercise_id?: string | null
          exercise_id?: string | null
          exercise_index?: number
          id?: string
          notes?: string | null
          updated_at?: string
          workout_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_session_exercises_custom_exercise_id_fkey"
            columns: ["custom_exercise_id"]
            isOneToOne: false
            referencedRelation: "custom_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_session_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_session_exercises_workout_session_id_fkey"
            columns: ["workout_session_id"]
            isOneToOne: false
            referencedRelation: "exercise_history"
            referencedColumns: ["workout_session_id"]
          },
          {
            foreignKeyName: "workout_session_exercises_workout_session_id_fkey"
            columns: ["workout_session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          name: string
          notes: string | null
          routine_day_id: string | null
          routine_id: string | null
          started_at: string
          status: Database["public"]["Enums"]["workout_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          name: string
          notes?: string | null
          routine_day_id?: string | null
          routine_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["workout_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          name?: string
          notes?: string | null
          routine_day_id?: string | null
          routine_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["workout_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_sessions_routine_day_id_fkey"
            columns: ["routine_day_id"]
            isOneToOne: false
            referencedRelation: "routine_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sessions_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "workout_routines"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_sets: {
        Row: {
          completed_at: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          reps: number | null
          rir: number | null
          rpe: number | null
          set_index: number
          set_type: Database["public"]["Enums"]["workout_set_type"]
          updated_at: string
          weight_kg: number | null
          workout_session_exercise_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          reps?: number | null
          rir?: number | null
          rpe?: number | null
          set_index: number
          set_type?: Database["public"]["Enums"]["workout_set_type"]
          updated_at?: string
          weight_kg?: number | null
          workout_session_exercise_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          reps?: number | null
          rir?: number | null
          rpe?: number | null
          set_index?: number
          set_type?: Database["public"]["Enums"]["workout_set_type"]
          updated_at?: string
          weight_kg?: number | null
          workout_session_exercise_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_sets_workout_session_exercise_id_fkey"
            columns: ["workout_session_exercise_id"]
            isOneToOne: false
            referencedRelation: "workout_session_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      daily_nutrition_totals: {
        Row: {
          calories: number | null
          carbohydrate_grams: number | null
          fat_grams: number | null
          fiber_grams: number | null
          logged_date: string | null
          protein_grams: number | null
          user_id: string | null
        }
        Relationships: []
      }
      exercise_history: {
        Row: {
          completed_at: string | null
          custom_exercise_id: string | null
          exercise_id: string | null
          exercise_key: string | null
          exercise_name: string | null
          reps: number | null
          rir: number | null
          rpe: number | null
          set_type: Database["public"]["Enums"]["workout_set_type"] | null
          started_at: string | null
          user_id: string | null
          weight_kg: number | null
          workout_session_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_session_exercises_custom_exercise_id_fkey"
            columns: ["custom_exercise_id"]
            isOneToOne: false
            referencedRelation: "custom_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_session_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_library: {
        Row: {
          attribution: Json | null
          body_part: string | null
          catalog_exercise_id: string | null
          category: string | null
          created_at: string | null
          custom_exercise_id: string | null
          description: string | null
          equipment: string | null
          exercise_key: string | null
          gif_source: string | null
          image_source: string | null
          instruction_steps: string[] | null
          instructions: string | null
          media_id: string | null
          media_path: string | null
          muscle_group: string | null
          name: string | null
          secondary_muscles: string[] | null
          source_kind: string | null
          source_version: string | null
          target: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
      personal_bests: {
        Row: {
          custom_exercise_id: string | null
          estimated_one_rep_max: number | null
          exercise_id: string | null
          exercise_key: string | null
          exercise_name: string | null
          max_reps: number | null
          max_weight_kg: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_session_exercises_custom_exercise_id_fkey"
            columns: ["custom_exercise_id"]
            isOneToOne: false
            referencedRelation: "custom_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_session_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_workout_summary: {
        Row: {
          total_volume_kg: number | null
          user_id: string | null
          week_start: string | null
          working_sets: number | null
          workouts: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      activate_routine: {
        Args: { target_routine_id: string }
        Returns: undefined
      }
      cancel_routine_import: {
        Args: { target_import_id: string }
        Returns: {
          ai_run_id: string | null
          cleanup_completed_at: string | null
          confirmed_at: string | null
          created_at: string
          expires_at: string
          extraction: Json
          id: string
          routine_id: string | null
          source_file_name: string
          source_mime_type: string
          source_storage_path: string
          status: string
          updated_at: string
          user_id: string
          warnings: Json
        }
        SetofOptions: {
          from: "*"
          to: "routine_imports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_rest_day: {
        Args: { target_day_id: string }
        Returns: {
          created_at: string
          current_cycle_index: number
          description: string | null
          id: string
          name: string
          source: string
          status: Database["public"]["Enums"]["routine_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workout_routines"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_workout: {
        Args: { target_session_id: string }
        Returns: {
          completed_at: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          name: string
          notes: string | null
          routine_day_id: string | null
          routine_id: string | null
          started_at: string
          status: Database["public"]["Enums"]["workout_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workout_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_coach_goal_update: {
        Args: {
          expected_goal_id: string
          target_goal_type: Database["public"]["Enums"]["goal_type"]
          target_message_id: string
          target_notes: string
        }
        Returns: {
          created_at: string
          goal_type: Database["public"]["Enums"]["goal_type"]
          id: string
          is_active: boolean
          notes: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "fitness_goals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_routine_import: {
        Args: { target_import_id: string; target_resolutions: Json }
        Returns: {
          created_at: string
          current_cycle_index: number
          description: string | null
          id: string
          name: string
          source: string
          status: Database["public"]["Enums"]["routine_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workout_routines"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_routine_draft_from_json: {
        Args: {
          target_days: Json
          target_description: string
          target_name: string
          target_source: string
        }
        Returns: {
          created_at: string
          current_cycle_index: number
          description: string | null
          id: string
          name: string
          source: string
          status: Database["public"]["Enums"]["routine_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workout_routines"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      dismiss_coach_goal_update: {
        Args: { target_message_id: string }
        Returns: undefined
      }
      get_routine_import_cleanup_manifest: {
        Args: { target_import_id: string }
        Returns: Json
      }
      list_expired_routine_import_cleanup_ids: {
        Args: { target_limit?: number }
        Returns: {
          import_id: string
        }[]
      }
      log_active_workout_set: {
        Args: {
          target_reps: number
          target_set_id: string
          target_weight_kg: number
        }
        Returns: {
          completed_at: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          reps: number | null
          rir: number | null
          rpe: number | null
          set_index: number
          set_type: Database["public"]["Enums"]["workout_set_type"]
          updated_at: string
          weight_kg: number | null
          workout_session_exercise_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workout_sets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      log_saved_food: {
        Args: {
          target_logged_date: string
          target_meal_type: Database["public"]["Enums"]["meal_type"]
          target_saved_food_id: string
        }
        Returns: {
          created_at: string
          id: string
          logged_date: string
          meal_type: Database["public"]["Enums"]["meal_type"]
          name: string | null
          photo_path: string | null
          source: Database["public"]["Enums"]["food_source"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "food_logs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_routine_import_cleanup_complete: {
        Args: { target_import_id: string }
        Returns: {
          ai_run_id: string | null
          cleanup_completed_at: string | null
          confirmed_at: string | null
          created_at: string
          expires_at: string
          extraction: Json
          id: string
          routine_id: string | null
          source_file_name: string
          source_mime_type: string
          source_storage_path: string
          status: string
          updated_at: string
          user_id: string
          warnings: Json
        }
        SetofOptions: {
          from: "*"
          to: "routine_imports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reorder_routine_days: {
        Args: { ordered_day_ids: string[]; target_routine_id: string }
        Returns: undefined
      }
      reorder_routine_exercises: {
        Args: { ordered_exercise_ids: string[]; target_day_id: string }
        Returns: undefined
      }
      set_fitness_goal: {
        Args: {
          preserve_existing_notes?: boolean
          target_goal_type: Database["public"]["Enums"]["goal_type"]
          target_notes?: string
        }
        Returns: {
          created_at: string
          goal_type: Database["public"]["Enums"]["goal_type"]
          id: string
          is_active: boolean
          notes: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "fitness_goals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      stage_routine_import_review: {
        Args: {
          target_ai_run_id: string
          target_exercises: Json
          target_expires_at: string
          target_extraction: Json
          target_import_id: string
          target_source_file_name: string
          target_source_mime_type: string
          target_source_storage_path: string
          target_warnings: Json
        }
        Returns: {
          ai_run_id: string | null
          cleanup_completed_at: string | null
          confirmed_at: string | null
          created_at: string
          expires_at: string
          extraction: Json
          id: string
          routine_id: string | null
          source_file_name: string
          source_mime_type: string
          source_storage_path: string
          status: string
          updated_at: string
          user_id: string
          warnings: Json
        }
        SetofOptions: {
          from: "*"
          to: "routine_imports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_or_resume_workout: {
        Args: { target_day_id: string }
        Returns: {
          completed_at: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          name: string
          notes: string | null
          routine_day_id: string | null
          routine_id: string | null
          started_at: string
          status: Database["public"]["Enums"]["workout_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workout_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      ai_run_status: "started" | "completed" | "failed" | "refused"
      biological_sex: "male" | "female" | "unspecified"
      daily_activity_level: "sedentary" | "light" | "moderate" | "very_active"
      food_source: "manual" | "quick_add" | "photo_estimate"
      goal_type:
        | "recomp"
        | "fat_loss"
        | "muscle_gain"
        | "maintenance"
        | "strength"
      meal_type: "breakfast" | "lunch" | "dinner" | "snacks" | "other"
      routine_status: "draft" | "active" | "archived"
      training_experience: "beginner" | "intermediate" | "advanced"
      workout_set_type: "warmup" | "working" | "failure" | "drop"
      workout_status: "in_progress" | "completed" | "discarded"
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
      ai_run_status: ["started", "completed", "failed", "refused"],
      biological_sex: ["male", "female", "unspecified"],
      daily_activity_level: ["sedentary", "light", "moderate", "very_active"],
      food_source: ["manual", "quick_add", "photo_estimate"],
      goal_type: [
        "recomp",
        "fat_loss",
        "muscle_gain",
        "maintenance",
        "strength",
      ],
      meal_type: ["breakfast", "lunch", "dinner", "snacks", "other"],
      routine_status: ["draft", "active", "archived"],
      training_experience: ["beginner", "intermediate", "advanced"],
      workout_set_type: ["warmup", "working", "failure", "drop"],
      workout_status: ["in_progress", "completed", "discarded"],
    },
  },
} as const
