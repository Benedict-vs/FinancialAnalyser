#!/usr/bin/env python3
"""
Test script for auto-learning category rules.
Run from backend directory with: python3 test_auto_learn.py
"""
import sys
import tempfile
from pathlib import Path
from datetime import date

# Add app to path
sys.path.insert(0, str(Path(__file__).parent))

from sqlmodel import Session, select, create_engine, SQLModel
from app.models import Source, Workspace, Category, CategoryRule, Transaction
from app.main import auto_learn_rule, categorise

def test_auto_learn():
    """Test the auto-learning functionality"""

    # Create in-memory SQLite database for testing
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        # Setup: Create workspace, category, source
        ws = Workspace(name="Test", description="Test workspace")
        session.add(ws)
        session.commit()

        cat_uncategorised = Category(name="Uncategorised", color="#94a3b8", is_system=True)
        cat_groceries = Category(name="Groceries", color="#16a34a", is_system=True)
        cat_partying = Category(name="Partying", color="#f97316", is_system=True)
        session.add_all([cat_uncategorised, cat_groceries, cat_partying])
        session.commit()

        src = Source(name="Test Source", type="test", color="#000000")
        session.add(src)
        session.commit()

        # Create a test transaction with counterparty "tegut"
        txn = Transaction(
            workspace_id=ws.id,
            source_id=src.id,
            date=date.today(),
            amount=-50.0,
            counterparty="tegut",
            description="Grocery store purchase",
            category_id=cat_uncategorised.id,  # Currently uncategorised
        )
        session.add(txn)
        session.commit()

        # Test 1: Create an auto-learning rule
        print("Test 1: Auto-learning rule creation")
        rule_result = auto_learn_rule(session, txn, cat_groceries.id)
        assert rule_result is not None, "Rule should be created"
        assert rule_result["pattern"] == "tegut", "Pattern should be 'tegut'"
        assert rule_result["category_id"] == cat_groceries.id, "Category should be Groceries"
        assert rule_result["priority"] == 150, "Priority should be 150"
        print("✓ Rule created successfully")

        # Test 2: Verify rule is in database
        print("\nTest 2: Verify rule is stored")
        rule = session.exec(select(CategoryRule).where(CategoryRule.pattern == "tegut")).first()
        assert rule is not None, "Rule should exist in database"
        assert rule.category_id == cat_groceries.id, "Rule should point to Groceries"
        print("✓ Rule stored correctly")

        # Test 3: No duplicate rules
        print("\nTest 3: No duplicate rule creation")
        rule_result2 = auto_learn_rule(session, txn, cat_groceries.id)
        assert rule_result2 is None, "No rule should be created for duplicate"
        rule_count = len(session.exec(select(CategoryRule).where(CategoryRule.pattern == "tegut")).all())
        assert rule_count == 1, "Should only have 1 rule for tegut"
        print("✓ No duplicates created")

        # Test 4: Different category creates new rule
        print("\nTest 4: Different category creates new rule")
        rule_result3 = auto_learn_rule(session, txn, cat_partying.id)
        assert rule_result3 is not None, "Rule should be created for different category"
        assert rule_result3["category_id"] == cat_partying.id, "New rule should point to Partying"
        rule_count = len(session.exec(select(CategoryRule).where(CategoryRule.pattern == "tegut")).all())
        assert rule_count == 2, "Should now have 2 rules for tegut"
        print("✓ Different category rule created")

        # Test 5: Empty counterparty doesn't create rule
        print("\nTest 5: Empty counterparty doesn't create rule")
        txn_empty = Transaction(
            workspace_id=ws.id,
            source_id=src.id,
            date=date.today(),
            amount=-25.0,
            counterparty="",
            description="Unknown purchase",
            category_id=cat_uncategorised.id,
        )
        session.add(txn_empty)
        session.commit()

        rule_result4 = auto_learn_rule(session, txn_empty, cat_groceries.id)
        assert rule_result4 is None, "No rule should be created for empty counterparty"
        print("✓ Empty counterparty handled correctly")

        # Test 6: Categorisation function works
        print("\nTest 6: Categorisation with auto-learned rules")
        # Create a new transaction to be categorized
        txn_new = Transaction(
            workspace_id=ws.id,
            source_id=src.id,
            date=date.today(),
            amount=-40.0,
            counterparty="tegut",
            description="Another grocery purchase",
            category_id=None,
        )
        session.add(txn_new)
        session.commit()

        # Categorise should now return the first rule (priority 150)
        categorised_id = categorise(session, txn_new.counterparty, txn_new.description)
        assert categorised_id == cat_groceries.id, "Should categorise to Groceries (first rule with higher priority)"
        print("✓ Categorisation works with auto-learned rules")

        print("\n✅ All tests passed!")

if __name__ == "__main__":
    test_auto_learn()
